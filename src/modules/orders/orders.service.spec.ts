import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { OrdersService } from './orders.service.js';
import {
  OrderStatus,
  PaymentStatus,
  Prisma,
  Role,
  VerificationStatus,
} from '../../generated/prisma/client.js';

describe('OrdersService', () => {
  let service: OrdersService;
  let mockPrisma: any;
  let mockNotifications: any;

  const mockSupplier = {
    id: 'supplier-1',
    userId: 'supplier-user-1',
    verificationStatus: VerificationStatus.VERIFIED,
    isAcceptingOrders: true,
  };

  const mockCoverage = {
    supplierProfileId: 'supplier-1',
    deliveryAreaId: 'area-1',
    deliveryFee: new Prisma.Decimal(10),
    deliveryArea: { isActive: true },
  };

  const mockListing = {
    supplierProfileId: 'supplier-1',
    fuelTypeId: 'fuel-1',
    isAvailable: true,
    isSuspended: false,
    fuelType: { id: 'fuel-1', name: 'Petrol (PMS)', isActive: true },
    pricePerLitre: new Prisma.Decimal(15),
    availableQuantity: new Prisma.Decimal(1000),
    minimumOrderLitres: new Prisma.Decimal(5),
  };

  beforeEach(() => {
    mockPrisma = {
      supplierProfile: {
        findUnique: vi.fn(),
      },
      supplierDeliveryArea: {
        findUnique: vi.fn(),
      },
      supplierFuel: {
        findMany: vi.fn(),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      order: {
        create: vi.fn(),
        findMany: vi.fn(),
        findUnique: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      orderStatusHistory: {
        create: vi.fn(),
      },
      $transaction: vi.fn((cb) => cb(mockPrisma)),
    };

    mockNotifications = { notify: vi.fn().mockResolvedValue(1) };

    service = new OrdersService(mockPrisma as any, mockNotifications as any);
  });

  describe('createOrder', () => {
    const dto = {
      supplierId: 'supplier-1',
      deliveryAreaId: 'area-1',
      deliveryAddress: '12 Test Street',
      items: [{ fuelTypeId: 'fuel-1', quantity: 10 }],
    };

    it('should compute subtotal/total correctly and create the order', async () => {
      mockPrisma.supplierProfile.findUnique.mockResolvedValue(mockSupplier);
      mockPrisma.supplierDeliveryArea.findUnique.mockResolvedValue(
        mockCoverage,
      );
      mockPrisma.supplierFuel.findMany.mockResolvedValue([mockListing]);
      mockPrisma.order.create.mockResolvedValue({ id: 'order-1' });

      await service.createOrder('customer-1', dto);

      expect(mockPrisma.order.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            customerId: 'customer-1',
            supplierProfileId: 'supplier-1',
            deliveryFee: mockCoverage.deliveryFee,
            subtotal: expect.objectContaining({ d: expect.anything() }),
          }),
        }),
      );

      const callArg = mockPrisma.order.create.mock.calls[0][0];
      expect(callArg.data.subtotal.toString()).toBe('150');
      expect(callArg.data.totalAmount.toString()).toBe('160');
      expect(mockPrisma.orderStatusHistory.create).toHaveBeenCalledWith({
        data: {
          orderId: 'order-1',
          fromStatus: null,
          toStatus: OrderStatus.PENDING,
        },
      });
    });

    /** A paused area keeps its existing orders but takes no new ones. */
    it('should refuse an order to a paused delivery area', async () => {
      mockPrisma.supplierProfile.findUnique.mockResolvedValue(mockSupplier);
      mockPrisma.supplierDeliveryArea.findUnique.mockResolvedValue({
        ...mockCoverage,
        deliveryArea: { isActive: false },
      });

      await expect(service.createOrder('customer-1', dto)).rejects.toThrow(
        new NotFoundException('Delivery area not available'),
      );
      expect(mockPrisma.supplierFuel.findMany).not.toHaveBeenCalled();
      expect(mockPrisma.order.create).not.toHaveBeenCalled();
    });

    it('should look up whether the delivery area is active', async () => {
      mockPrisma.supplierProfile.findUnique.mockResolvedValue(mockSupplier);
      mockPrisma.supplierDeliveryArea.findUnique.mockResolvedValue(mockCoverage);
      mockPrisma.supplierFuel.findMany.mockResolvedValue([mockListing]);
      mockPrisma.order.create.mockResolvedValue({ id: 'order-1' });

      await service.createOrder('customer-1', dto);

      expect(mockPrisma.supplierDeliveryArea.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          include: { deliveryArea: { select: { isActive: true } } },
        }),
      );
    });

    /**
     * Without this, the owner becomes the CUSTOMER of their own order, so no one
     * is left who may confirm it — and the buyer has already paid by then.
     */
    it('should refuse an order placed on the buyer’s own depot', async () => {
      mockPrisma.supplierProfile.findUnique.mockResolvedValue(mockSupplier);

      await expect(
        service.createOrder(mockSupplier.userId, dto),
      ).rejects.toThrow(ForbiddenException);

      expect(mockPrisma.order.create).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when the supplier does not exist', async () => {
      mockPrisma.supplierProfile.findUnique.mockResolvedValue(null);

      await expect(service.createOrder('customer-1', dto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ForbiddenException when the supplier is not verified', async () => {
      mockPrisma.supplierProfile.findUnique.mockResolvedValue({
        ...mockSupplier,
        verificationStatus: VerificationStatus.PENDING,
      });

      await expect(service.createOrder('customer-1', dto)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should throw ForbiddenException when the supplier is not accepting orders', async () => {
      mockPrisma.supplierProfile.findUnique.mockResolvedValue({
        ...mockSupplier,
        isAcceptingOrders: false,
      });

      await expect(service.createOrder('customer-1', dto)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should throw NotFoundException when the supplier does not deliver to the area', async () => {
      mockPrisma.supplierProfile.findUnique.mockResolvedValue(mockSupplier);
      mockPrisma.supplierDeliveryArea.findUnique.mockResolvedValue(null);

      await expect(service.createOrder('customer-1', dto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should refuse an admin-suspended listing', async () => {
      mockPrisma.supplierProfile.findUnique.mockResolvedValue(mockSupplier);
      mockPrisma.supplierDeliveryArea.findUnique.mockResolvedValue(
        mockCoverage,
      );
      mockPrisma.supplierFuel.findMany.mockResolvedValue([
        { ...mockListing, isSuspended: true },
      ]);

      await expect(service.createOrder('customer-1', dto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should refuse a deactivated fuel type', async () => {
      mockPrisma.supplierProfile.findUnique.mockResolvedValue(mockSupplier);
      mockPrisma.supplierDeliveryArea.findUnique.mockResolvedValue(
        mockCoverage,
      );
      mockPrisma.supplierFuel.findMany.mockResolvedValue([
        {
          ...mockListing,
          fuelType: { id: 'fuel-1', name: 'Petrol (PMS)', isActive: false },
        },
      ]);

      await expect(service.createOrder('customer-1', dto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException when the fuel listing is unavailable', async () => {
      mockPrisma.supplierProfile.findUnique.mockResolvedValue(mockSupplier);
      mockPrisma.supplierDeliveryArea.findUnique.mockResolvedValue(
        mockCoverage,
      );
      mockPrisma.supplierFuel.findMany.mockResolvedValue([
        { ...mockListing, isAvailable: false },
      ]);

      await expect(service.createOrder('customer-1', dto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw BadRequestException when below the minimum order', async () => {
      mockPrisma.supplierProfile.findUnique.mockResolvedValue(mockSupplier);
      mockPrisma.supplierDeliveryArea.findUnique.mockResolvedValue(
        mockCoverage,
      );
      mockPrisma.supplierFuel.findMany.mockResolvedValue([mockListing]);

      await expect(
        service.createOrder('customer-1', {
          ...dto,
          items: [{ fuelTypeId: 'fuel-1', quantity: 2 }],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when requested quantity exceeds availability', async () => {
      mockPrisma.supplierProfile.findUnique.mockResolvedValue(mockSupplier);
      mockPrisma.supplierDeliveryArea.findUnique.mockResolvedValue(
        mockCoverage,
      );
      mockPrisma.supplierFuel.findMany.mockResolvedValue([mockListing]);

      await expect(
        service.createOrder('customer-1', {
          ...dto,
          items: [{ fuelTypeId: 'fuel-1', quantity: 5000 }],
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('cancelOrder', () => {
    const pendingOrder = {
      id: 'order-1',
      customerId: 'customer-1',
      supplierProfileId: 'supplier-1',
      supplier: { userId: 'supplier-user-1' },
      status: OrderStatus.PENDING,
      inventoryDeducted: false,
      items: [],
      payment: null,
    };

    it('should cancel a PENDING order owned by the requesting customer', async () => {
      mockPrisma.order.findUnique
        .mockResolvedValueOnce(pendingOrder)
        .mockResolvedValueOnce({
          ...pendingOrder,
          status: OrderStatus.CANCELLED,
        });

      const result = await service.cancelOrder(
        'order-1',
        'customer-1',
        'Changed my mind',
      );

      expect(result?.status).toBe(OrderStatus.CANCELLED);
      expect(mockPrisma.orderStatusHistory.create).toHaveBeenCalledWith({
        data: {
          orderId: 'order-1',
          fromStatus: OrderStatus.PENDING,
          toStatus: OrderStatus.CANCELLED,
          note: 'Changed my mind',
        },
      });
    });

    it('should throw ForbiddenException when the requester does not own the order', async () => {
      mockPrisma.order.findUnique.mockResolvedValue(pendingOrder);

      await expect(
        service.cancelOrder('order-1', 'someone-else', undefined),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw BadRequestException when the order can no longer be cancelled', async () => {
      mockPrisma.order.findUnique.mockResolvedValue({
        ...pendingOrder,
        status: OrderStatus.DELIVERED,
      });

      await expect(
        service.cancelOrder('order-1', 'customer-1', undefined),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('getOrderById', () => {
    const order = {
      id: 'order-1',
      customerId: 'customer-1',
      supplier: { id: 'supplier-1', userId: 'supplier-user-1' },
    };

    it('should return the order for the owning customer', async () => {
      mockPrisma.order.findUnique.mockResolvedValue(order);

      const result = await service.getOrderById(
        'order-1',
        'customer-1',
        Role.CUSTOMER,
      );
      expect(result).toBe(order);
    });

    it('should return the order for the owning supplier', async () => {
      mockPrisma.order.findUnique.mockResolvedValue(order);

      const result = await service.getOrderById(
        'order-1',
        'supplier-user-1',
        Role.SUPPLIER,
      );
      expect(result).toBe(order);
    });

    it('should return the order for an admin regardless of ownership', async () => {
      mockPrisma.order.findUnique.mockResolvedValue(order);

      const result = await service.getOrderById(
        'order-1',
        'unrelated-admin',
        Role.ADMIN,
      );
      expect(result).toBe(order);
    });

    it('should throw ForbiddenException for an unrelated non-admin user', async () => {
      mockPrisma.order.findUnique.mockResolvedValue(order);

      await expect(
        service.getOrderById('order-1', 'unrelated-customer', Role.CUSTOMER),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException when the order does not exist', async () => {
      mockPrisma.order.findUnique.mockResolvedValue(null);

      await expect(
        service.getOrderById('missing-order', 'customer-1', Role.CUSTOMER),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateOrderStatus', () => {
    const baseOrder = {
      id: 'order-1',
      customerId: 'customer-1',
      supplierProfileId: 'supplier-1',
      supplier: { userId: 'supplier-user-1' },
      inventoryDeducted: true,
      items: [{ fuelTypeId: 'fuel-1', quantity: new Prisma.Decimal(10) }],
      payment: { status: PaymentStatus.SUCCESS },
    };

    const mockOrderAt = (status: OrderStatus, overrides: any = {}) => {
      const order = { ...baseOrder, status, ...overrides };
      mockPrisma.order.findUnique
        .mockResolvedValueOnce(order)
        .mockResolvedValueOnce(order);
      return order;
    };

    it('should let the supplier confirm an order awaiting confirmation', async () => {
      mockOrderAt(OrderStatus.AWAITING_CONFIRMATION);

      await service.updateOrderStatus(
        'order-1',
        OrderStatus.CONFIRMED,
        'supplier-user-1',
        Role.SUPPLIER,
      );

      expect(mockPrisma.order.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          // Only applied if the order is still where it was read.
          where: { id: 'order-1', status: OrderStatus.AWAITING_CONFIRMATION },
          data: expect.objectContaining({
            status: OrderStatus.CONFIRMED,
            confirmedAt: expect.any(Date),
          }),
        }),
      );
    });

    it('should not let the customer confirm the order on the supplier behalf', async () => {
      mockOrderAt(OrderStatus.AWAITING_CONFIRMATION);

      await expect(
        service.updateOrderStatus(
          'order-1',
          OrderStatus.CONFIRMED,
          'customer-1',
          Role.CUSTOMER,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should let the customer confirm delivery', async () => {
      mockOrderAt(OrderStatus.OUT_FOR_DELIVERY);

      await service.updateOrderStatus(
        'order-1',
        OrderStatus.DELIVERED,
        'customer-1',
        Role.CUSTOMER,
      );

      expect(mockPrisma.order.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'order-1', status: OrderStatus.OUT_FOR_DELIVERY },
          data: expect.objectContaining({
            status: OrderStatus.DELIVERED,
            deliveredAt: expect.any(Date),
          }),
        }),
      );
    });

    it('should not let the supplier mark its own delivery as delivered', async () => {
      mockOrderAt(OrderStatus.OUT_FOR_DELIVERY);

      await expect(
        service.updateOrderStatus(
          'order-1',
          OrderStatus.DELIVERED,
          'supplier-user-1',
          Role.SUPPLIER,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should reject an illegal jump straight to DELIVERED', async () => {
      mockOrderAt(OrderStatus.AWAITING_CONFIRMATION);

      await expect(
        service.updateOrderStatus(
          'order-1',
          OrderStatus.DELIVERED,
          'customer-1',
          Role.CUSTOMER,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should restore inventory and queue a refund when the supplier rejects a paid order', async () => {
      mockOrderAt(OrderStatus.AWAITING_CONFIRMATION);

      await service.updateOrderStatus(
        'order-1',
        OrderStatus.REJECTED,
        'supplier-user-1',
        Role.SUPPLIER,
        'Out of stock',
      );

      expect(mockPrisma.supplierFuel.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            availableQuantity: { increment: baseOrder.items[0].quantity },
          },
        }),
      );
      expect(mockPrisma.order.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: OrderStatus.REFUND_PENDING },
        }),
      );
    });

    it('should not restore inventory when it was never deducted', async () => {
      mockOrderAt(OrderStatus.AWAITING_CONFIRMATION, {
        inventoryDeducted: false,
      });

      await service.updateOrderStatus(
        'order-1',
        OrderStatus.REJECTED,
        'supplier-user-1',
        Role.SUPPLIER,
      );

      expect(mockPrisma.supplierFuel.updateMany).not.toHaveBeenCalled();
    });

    /**
     * Regression: the state was checked on a snapshot and then written blindly,
     * so a double-clicked rejection restored the same stock twice, and a
     * cancellation could overwrite a payment that had just landed.
     */
    it('changes nothing when the order moved after it was read', async () => {
      mockOrderAt(OrderStatus.AWAITING_CONFIRMATION);
      mockPrisma.order.updateMany.mockResolvedValueOnce({ count: 0 });

      await expect(
        service.updateOrderStatus(
          'order-1',
          OrderStatus.REJECTED,
          'supplier-user-1',
          Role.SUPPLIER,
        ),
      ).rejects.toThrow(ConflictException);

      expect(mockPrisma.supplierFuel.updateMany).not.toHaveBeenCalled();
      expect(mockPrisma.orderStatusHistory.create).not.toHaveBeenCalled();
      expect(mockNotifications.notify).not.toHaveBeenCalled();
    });

    it('restores stock only after the rejection has been claimed', async () => {
      mockOrderAt(OrderStatus.AWAITING_CONFIRMATION);

      await service.updateOrderStatus(
        'order-1',
        OrderStatus.REJECTED,
        'supplier-user-1',
        Role.SUPPLIER,
      );

      const claimedAt = mockPrisma.order.updateMany.mock.invocationCallOrder[0];
      const restoredAt = mockPrisma.supplierFuel.updateMany.mock.invocationCallOrder[0];
      expect(claimedAt).toBeLessThan(restoredAt);
      expect(mockPrisma.order.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ inventoryDeducted: false }),
        }),
      );
    });

    it('never lets anyone push a cancelled order into a refund by hand', async () => {
      mockOrderAt(OrderStatus.CANCELLED);

      await expect(
        service.updateOrderStatus(
          'order-1',
          OrderStatus.REFUND_PENDING,
          'admin-1',
          Role.ADMIN,
        ),
      ).rejects.toThrow(ForbiddenException);
      expect(mockPrisma.order.updateMany).not.toHaveBeenCalled();
    });

    it('should only let an admin complete a refund', async () => {
      mockOrderAt(OrderStatus.REFUND_PENDING);

      await expect(
        service.updateOrderStatus(
          'order-1',
          OrderStatus.REFUNDED,
          'supplier-user-1',
          Role.SUPPLIER,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException for a user unrelated to the order', async () => {
      mockOrderAt(OrderStatus.AWAITING_CONFIRMATION);

      await expect(
        service.updateOrderStatus(
          'order-1',
          OrderStatus.CONFIRMED,
          'stranger',
          Role.CUSTOMER,
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
