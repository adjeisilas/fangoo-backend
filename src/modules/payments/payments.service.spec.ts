import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PaymentsService } from './payments.service.js';
import {
  OrderSource,
  OrderStatus,
  PaymentStatus,
  Prisma,
} from '../../generated/prisma/client.js';

describe('PaymentsService', () => {
  let service: PaymentsService;
  let mockPrisma: any;
  let mockPaystack: any;
  let mockConfig: any;

  const mockOrder = {
    id: 'order-1',
    customerId: 'customer-1',
    supplierProfileId: 'supplier-1',
    status: OrderStatus.PAYMENT_PENDING,
    source: OrderSource.CATALOGUE,
    totalAmount: new Prisma.Decimal('182.50'),
    customer: { email: 'customer@example.com' },
    payment: null,
    items: [{ fuelTypeId: 'fuel-1', quantity: new Prisma.Decimal(10) }],
  };

  const mockPayment = {
    id: 'payment-1',
    orderId: 'order-1',
    reference: 'fangoo_ref_1',
    amount: new Prisma.Decimal('182.50'),
    status: PaymentStatus.PENDING,
    order: mockOrder,
  };

  beforeEach(() => {
    mockPrisma = {
      order: {
        findUnique: vi.fn(),
        update: vi.fn(),
      },
      payment: {
        findUnique: vi.fn(),
        findMany: vi.fn().mockResolvedValue([]),
        upsert: vi.fn(),
        update: vi.fn(),
      },
      orderStatusHistory: {
        create: vi.fn(),
      },
      supplierFuel: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      $transaction: vi.fn((cb) => cb(mockPrisma)),
    };

    mockPaystack = {
      initializeTransaction: vi.fn(),
      verifyTransaction: vi.fn(),
      verifyWebhookSignature: vi.fn(),
      refundTransaction: vi
        .fn()
        .mockResolvedValue({ id: 77, status: 'processed', amount: 1000, currency: 'GHS' }),
      expectedMinorUnits: vi.fn((amount: string) =>
        Math.round(Number(amount) * 100),
      ),
    };

    mockConfig = { get: vi.fn((_key: string, fallback?: string) => fallback) };

    service = new PaymentsService(
      mockPrisma as any,
      mockPaystack as any,
      mockConfig as any,
    );
  });

  describe('initializePayment', () => {
    it('should initialize a transaction and store the reference', async () => {
      mockPrisma.order.findUnique.mockResolvedValue({
        ...mockOrder,
        status: OrderStatus.PENDING,
      });
      mockPaystack.initializeTransaction.mockResolvedValue({
        authorizationUrl: 'https://checkout.paystack.com/abc',
        accessCode: 'abc',
        reference: 'generated',
      });

      const result = await service.initializePayment('order-1', 'customer-1');

      expect(result.authorizationUrl).toBe('https://checkout.paystack.com/abc');
      expect(mockPaystack.initializeTransaction).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'customer@example.com',
          amount: '182.5',
        }),
      );
      expect(mockPrisma.payment.upsert).toHaveBeenCalled();
      // PENDING orders advance to PAYMENT_PENDING when checkout starts
      expect(mockPrisma.order.update).toHaveBeenCalledWith({
        where: { id: 'order-1' },
        data: { status: OrderStatus.PAYMENT_PENDING },
      });
    });

    it('should throw ForbiddenException when the order belongs to someone else', async () => {
      mockPrisma.order.findUnique.mockResolvedValue(mockOrder);

      await expect(
        service.initializePayment('order-1', 'another-customer'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw BadRequestException when the order is no longer payable', async () => {
      mockPrisma.order.findUnique.mockResolvedValue({
        ...mockOrder,
        status: OrderStatus.CANCELLED,
      });

      await expect(
        service.initializePayment('order-1', 'customer-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when the order is already paid', async () => {
      mockPrisma.order.findUnique.mockResolvedValue({
        ...mockOrder,
        payment: { status: PaymentStatus.SUCCESS },
      });

      await expect(
        service.initializePayment('order-1', 'customer-1'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('confirmPayment', () => {
    it('should be idempotent — an already-successful payment does nothing', async () => {
      mockPrisma.payment.findUnique.mockResolvedValue({
        ...mockPayment,
        status: PaymentStatus.SUCCESS,
      });

      const result = await service.confirmPayment('fangoo_ref_1');

      expect(result.alreadyProcessed).toBe(true);
      expect(mockPaystack.verifyTransaction).not.toHaveBeenCalled();
      expect(mockPrisma.supplierFuel.updateMany).not.toHaveBeenCalled();
    });

    it('should decrement inventory and advance the order once payment is verified', async () => {
      mockPrisma.payment.findUnique.mockResolvedValue(mockPayment);
      mockPaystack.verifyTransaction.mockResolvedValue({
        status: 'success',
        reference: 'fangoo_ref_1',
        amount: 18250,
        currency: 'GHS',
        paidAt: '2026-09-10T12:00:00.000Z',
        gatewayResponse: 'Successful',
      });
      mockPrisma.payment.update.mockResolvedValue({
        ...mockPayment,
        status: PaymentStatus.SUCCESS,
      });

      await service.confirmPayment('fangoo_ref_1');

      expect(mockPrisma.supplierFuel.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            supplierProfileId: 'supplier-1',
            fuelTypeId: 'fuel-1',
            availableQuantity: { gte: mockOrder.items[0].quantity },
          }),
        }),
      );
      expect(mockPrisma.order.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: OrderStatus.PAID }),
        }),
      );
      expect(mockPrisma.order.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: OrderStatus.AWAITING_CONFIRMATION,
          }),
        }),
      );
    });

    it('should not touch catalogue stock for an RFQ-sourced order', async () => {
      mockPrisma.payment.findUnique.mockResolvedValue({
        ...mockPayment,
        order: { ...mockOrder, source: OrderSource.REQUEST },
      });
      mockPaystack.verifyTransaction.mockResolvedValue({
        status: 'success',
        reference: 'fangoo_ref_1',
        amount: 18250,
        currency: 'GHS',
        paidAt: null,
        gatewayResponse: 'Successful',
      });
      mockPrisma.payment.update.mockResolvedValue({
        ...mockPayment,
        status: PaymentStatus.SUCCESS,
      });

      await service.confirmPayment('fangoo_ref_1');

      // The price was agreed in an offer, not drawn from a published listing.
      expect(mockPrisma.supplierFuel.updateMany).not.toHaveBeenCalled();
      expect(mockPrisma.order.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: OrderStatus.PAID }),
        }),
      );
    });

    it('should reject a payment whose amount does not match the order total', async () => {
      mockPrisma.payment.findUnique.mockResolvedValue(mockPayment);
      mockPaystack.verifyTransaction.mockResolvedValue({
        status: 'success',
        reference: 'fangoo_ref_1',
        amount: 100, // GHS 1.00 instead of 182.50
        currency: 'GHS',
        paidAt: null,
        gatewayResponse: 'Successful',
      });
      mockPrisma.payment.update.mockResolvedValue({
        ...mockPayment,
        status: PaymentStatus.FAILED,
      });

      await service.confirmPayment('fangoo_ref_1');

      expect(mockPrisma.payment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: PaymentStatus.FAILED,
            failureReason: 'Amount paid did not match the order total',
          }),
        }),
      );
      expect(mockPrisma.supplierFuel.updateMany).not.toHaveBeenCalled();
      expect(mockPrisma.order.update).not.toHaveBeenCalled();
    });

    it('should mark the payment failed when Paystack reports a non-success status', async () => {
      mockPrisma.payment.findUnique.mockResolvedValue(mockPayment);
      mockPaystack.verifyTransaction.mockResolvedValue({
        status: 'failed',
        reference: 'fangoo_ref_1',
        amount: 18250,
        currency: 'GHS',
        paidAt: null,
        gatewayResponse: 'Declined by bank',
      });
      mockPrisma.payment.update.mockResolvedValue({
        ...mockPayment,
        status: PaymentStatus.FAILED,
      });

      await service.confirmPayment('fangoo_ref_1');

      expect(mockPrisma.payment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: PaymentStatus.FAILED,
            failureReason: 'Declined by bank',
          }),
        }),
      );
      expect(mockPrisma.supplierFuel.updateMany).not.toHaveBeenCalled();
    });

    it('should flag for manual review when stock ran short after payment', async () => {
      mockPrisma.payment.findUnique.mockResolvedValue(mockPayment);
      mockPaystack.verifyTransaction.mockResolvedValue({
        status: 'success',
        reference: 'fangoo_ref_1',
        amount: 18250,
        currency: 'GHS',
        paidAt: null,
        gatewayResponse: 'Successful',
      });
      mockPrisma.payment.update.mockResolvedValue({
        ...mockPayment,
        status: PaymentStatus.SUCCESS,
      });
      mockPrisma.supplierFuel.updateMany.mockResolvedValue({ count: 0 });

      await service.confirmPayment('fangoo_ref_1');

      expect(mockPrisma.orderStatusHistory.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            toStatus: OrderStatus.AWAITING_CONFIRMATION,
            note: 'Stock ran short after payment — supplier review required',
          }),
        }),
      );
    });

    it('should throw NotFoundException for an unknown reference', async () => {
      mockPrisma.payment.findUnique.mockResolvedValue(null);

      await expect(service.confirmPayment('nope')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('confirmPaymentForCustomer', () => {
    it('should reject a reference belonging to another customer', async () => {
      mockPrisma.payment.findUnique.mockResolvedValue({
        ...mockPayment,
        order: { customerId: 'customer-1' },
      });

      await expect(
        service.confirmPaymentForCustomer('fangoo_ref_1', 'someone-else'),
      ).rejects.toThrow(ForbiddenException);
      expect(mockPaystack.verifyTransaction).not.toHaveBeenCalled();
    });

    it('should confirm when the caller owns the order', async () => {
      mockPrisma.payment.findUnique.mockResolvedValue({
        ...mockPayment,
        status: PaymentStatus.SUCCESS,
        order: { customerId: 'customer-1' },
      });

      const result = await service.confirmPaymentForCustomer(
        'fangoo_ref_1',
        'customer-1',
      );

      expect(result.alreadyProcessed).toBe(true);
    });

    it('should throw NotFoundException for an unknown reference', async () => {
      mockPrisma.payment.findUnique.mockResolvedValue(null);

      await expect(
        service.confirmPaymentForCustomer('nope', 'customer-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('handleWebhook', () => {
    it('should reject a webhook with an invalid signature', async () => {
      mockPaystack.verifyWebhookSignature.mockReturnValue(false);

      await expect(
        service.handleWebhook(Buffer.from('{}'), 'bad-signature'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should confirm the payment on charge.success', async () => {
      mockPaystack.verifyWebhookSignature.mockReturnValue(true);
      mockPrisma.payment.findUnique.mockResolvedValue({
        ...mockPayment,
        status: PaymentStatus.SUCCESS,
      });

      const body = Buffer.from(
        JSON.stringify({
          event: 'charge.success',
          data: { reference: 'fangoo_ref_1' },
        }),
      );

      const result = await service.handleWebhook(body, 'good-signature');

      expect(result).toEqual({ received: true });
      expect(mockPrisma.payment.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { reference: 'fangoo_ref_1' } }),
      );
    });

    it('should ignore unrelated events', async () => {
      mockPaystack.verifyWebhookSignature.mockReturnValue(true);

      const body = Buffer.from(
        JSON.stringify({ event: 'transfer.failed', data: {} }),
      );

      const result = await service.handleWebhook(body, 'good-signature');

      expect(result).toEqual({ received: true });
      expect(mockPrisma.payment.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('confirmPayment on a settled payment', () => {
    /**
     * Regression: a refunded payment used to be re-verified against Paystack, which
     * no longer reports the transaction as "success" — so the row was rewritten as
     * FAILED and the record of the refund was lost. Reloading the payment-callback
     * page after a refund was enough to do it.
     */
    it('never re-derives a REFUNDED payment from the provider', async () => {
      mockPrisma.payment.findUnique.mockResolvedValue({
        id: 'pay-1',
        reference: 'fangoo_ref_1',
        status: PaymentStatus.REFUNDED,
        order: { id: 'order-1', items: [] },
      });

      const result = await service.confirmPayment('fangoo_ref_1');

      expect(result.alreadyProcessed).toBe(true);
      expect(result.payment.status).toBe(PaymentStatus.REFUNDED);
      expect(mockPaystack.verifyTransaction).not.toHaveBeenCalled();
      expect(mockPrisma.payment.update).not.toHaveBeenCalled();
    });

    it('still short-circuits an already SUCCESS payment', async () => {
      mockPrisma.payment.findUnique.mockResolvedValue({
        id: 'pay-1',
        reference: 'fangoo_ref_1',
        status: PaymentStatus.SUCCESS,
        order: { id: 'order-1', items: [] },
      });

      const result = await service.confirmPayment('fangoo_ref_1');

      expect(result.alreadyProcessed).toBe(true);
      expect(mockPaystack.verifyTransaction).not.toHaveBeenCalled();
    });
  });

  describe('refundOrder', () => {
    const paidPayment = {
      id: 'pay-1',
      orderId: 'order-1',
      reference: 'fangoo_ref_1',
      amount: { toString: () => '182.50' },
      status: PaymentStatus.SUCCESS,
      order: { id: 'order-1', status: OrderStatus.REFUND_PENDING },
    };

    beforeEach(() => {
      mockPrisma.payment.findUnique.mockResolvedValue(paidPayment);
      mockPrisma.payment.update.mockResolvedValue({});
      mockPrisma.order.update.mockResolvedValue({
        id: 'order-1',
        status: OrderStatus.REFUNDED,
      });
    });

    it('refunds through the provider and closes the order out', async () => {
      const result = await service.refundOrder('order-1', 'Depot out of stock');

      expect(mockPaystack.refundTransaction).toHaveBeenCalledWith(
        'fangoo_ref_1',
        '182.50',
        'Depot out of stock',
      );
      expect(mockPrisma.payment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: PaymentStatus.REFUNDED }),
        }),
      );
      expect(mockPrisma.order.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: OrderStatus.REFUNDED },
        }),
      );
      expect(result.status).toBe(OrderStatus.REFUNDED);
      expect(result.providerRefundId).toBe(77);
    });

    it('writes the refund to the order history', async () => {
      await service.refundOrder('order-1', 'Depot out of stock');

      expect(mockPrisma.orderStatusHistory.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          fromStatus: OrderStatus.REFUND_PENDING,
          toStatus: OrderStatus.REFUNDED,
          note: 'Depot out of stock',
        }),
      });
    });

    /**
     * The provider call must happen first. If Paystack refuses and we had already
     * written REFUNDED, the buyer would be recorded as repaid without the money
     * having moved.
     */
    it('leaves everything untouched when the provider refuses', async () => {
      mockPaystack.refundTransaction.mockRejectedValue(
        new BadRequestException('Transaction has already been refunded'),
      );

      await expect(service.refundOrder('order-1')).rejects.toThrow(
        BadRequestException,
      );

      expect(mockPrisma.payment.update).not.toHaveBeenCalled();
      expect(mockPrisma.order.update).not.toHaveBeenCalled();
    });

    it('refuses to refund the same payment twice', async () => {
      mockPrisma.payment.findUnique.mockResolvedValue({
        ...paidPayment,
        status: PaymentStatus.REFUNDED,
      });

      await expect(service.refundOrder('order-1')).rejects.toThrow(
        ConflictException,
      );
      expect(mockPaystack.refundTransaction).not.toHaveBeenCalled();
    });

    it('refuses to refund a payment that never succeeded', async () => {
      mockPrisma.payment.findUnique.mockResolvedValue({
        ...paidPayment,
        status: PaymentStatus.FAILED,
      });

      await expect(service.refundOrder('order-1')).rejects.toThrow(
        BadRequestException,
      );
      expect(mockPaystack.refundTransaction).not.toHaveBeenCalled();
    });

    it.each([
      [PaymentStatus.ABANDONED, 'An abandoned payment cannot be refunded'],
      [PaymentStatus.FAILED, 'A failed payment cannot be refunded'],
      [PaymentStatus.PENDING, 'A pending payment cannot be refunded'],
    ])('explains why a %s payment is refused, with the right article', async (
      status,
      message,
    ) => {
      mockPrisma.payment.findUnique.mockResolvedValue({ ...paidPayment, status });

      await expect(service.refundOrder('order-1')).rejects.toThrow(message);
    });

    // Honours the central lifecycle map rather than a second copy of the rules.
    it('refuses an order whose state does not allow a refund', async () => {
      mockPrisma.payment.findUnique.mockResolvedValue({
        ...paidPayment,
        order: { id: 'order-1', status: OrderStatus.DELIVERED },
      });

      await expect(service.refundOrder('order-1')).rejects.toThrow(
        BadRequestException,
      );
      expect(mockPaystack.refundTransaction).not.toHaveBeenCalled();
    });

    it('404s when the order was never paid for', async () => {
      mockPrisma.payment.findUnique.mockResolvedValue(null);

      await expect(service.refundOrder('order-1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('listAllForAdmin', () => {
    it('returns every payment, newest first, with buyer and supplier resolved', async () => {
      await service.listAllForAdmin();

      const args = mockPrisma.payment.findMany.mock.calls[0][0];
      expect(args.where).toEqual({});
      expect(args.orderBy).toEqual({ createdAt: 'desc' });
      expect(args.include.order.select.customer).toBeDefined();
      expect(args.include.order.select.supplier).toBeDefined();
    });

    it('filters by status when one is given', async () => {
      await service.listAllForAdmin(PaymentStatus.FAILED);

      expect(mockPrisma.payment.findMany.mock.calls[0][0].where).toEqual({
        status: PaymentStatus.FAILED,
      });
    });

    // A dashboard must not silently truncate to a page size it never states.
    it('caps the result set so one query cannot pull the whole ledger', async () => {
      await service.listAllForAdmin();

      expect(mockPrisma.payment.findMany.mock.calls[0][0].take).toBe(200);
    });
  });
});
