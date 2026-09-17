import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import {
  NotificationType,
  OrderStatus,
  PaymentStatus,
  Prisma,
  Role,
  VerificationStatus,
} from '../../generated/prisma/client.js';
import {
  canTransitionOrderStatus,
  getAllowedActors,
  type OrderActor,
} from '../../common/constants/order-status-transitions.js';
import { CreateOrderDto } from './dto/create-order.dto.js';
import { DELIVERY_AREA_WITH_REGION } from '../delivery-areas/delivery-area.query.js';

const ORDER_INCLUDE = {
  items: { include: { fuelType: true } },
  supplier: { select: { id: true, companyName: true, userId: true } },
  deliveryArea: DELIVERY_AREA_WITH_REGION,
} satisfies Prisma.OrderInclude;

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * Who should hear about an order reaching a given state, and what to tell them.
   * Transitions absent from this map are ones nobody needs pushing about — the
   * actor who caused them already knows.
   */
  private orderNotification(
    status: OrderStatus,
    order: {
      id: string;
      customerId: string;
      rejectionReason: string | null;
      supplier: { userId: string; companyName: string };
    },
  ): { userId: string; type: NotificationType; title: string; body: string; link: string } | null {
    const short = `#${order.id.slice(0, 8)}`;

    switch (status) {
      case OrderStatus.CONFIRMED:
        return {
          userId: order.customerId,
          type: NotificationType.ORDER_CONFIRMED,
          title: `Order ${short} confirmed`,
          body: `${order.supplier.companyName} accepted your order and is preparing it.`,
          link: `/orders/${order.id}`,
        };
      case OrderStatus.OUT_FOR_DELIVERY:
        return {
          userId: order.customerId,
          type: NotificationType.ORDER_DISPATCHED,
          title: `Order ${short} is on the way`,
          body: `${order.supplier.companyName} has dispatched your fuel. Confirm arrival once it reaches you.`,
          link: `/orders/${order.id}`,
        };
      case OrderStatus.DELIVERED:
        // The buyer confirms delivery, so it is the supplier who learns something.
        return {
          userId: order.supplier.userId,
          type: NotificationType.ORDER_DELIVERED,
          title: `Order ${short} confirmed delivered`,
          body: 'The buyer confirmed arrival. This order is complete.',
          link: '/supplier/orders',
        };
      case OrderStatus.REJECTED:
        return {
          userId: order.customerId,
          type: NotificationType.ORDER_REJECTED,
          title: `Order ${short} was rejected`,
          body: order.rejectionReason
            ? `${order.supplier.companyName} could not fulfil it: ${order.rejectionReason}`
            : `${order.supplier.companyName} could not fulfil this order.`,
          link: `/orders/${order.id}`,
        };
      default:
        return null;
    }
  }

  async createOrder(customerId: string, dto: CreateOrderDto) {
    const supplier = await this.prisma.supplierProfile.findUnique({
      where: { id: dto.supplierId },
    });

    if (!supplier) {
      throw new NotFoundException('Supplier not found');
    }

    /*
     * Ordering from your own depot strands the order. `resolveActor` matches the
     * customer first, so the owner is the CUSTOMER of their own order and nobody
     * is left who may confirm it — after the buyer has already paid. Beyond that,
     * self-purchases would inflate a supplier's own order count and revenue, and
     * the confirm/deliver handshake means nothing when one person is both sides.
     */
    if (supplier.userId === customerId) {
      throw new ForbiddenException('You cannot order from your own depot');
    }

    if (
      supplier.verificationStatus !== VerificationStatus.VERIFIED ||
      !supplier.isAcceptingOrders
    ) {
      throw new ForbiddenException(
        'This supplier is not currently accepting orders',
      );
    }

    const coverage = await this.prisma.supplierDeliveryArea.findUnique({
      where: {
        supplierProfileId_deliveryAreaId: {
          supplierProfileId: supplier.id,
          deliveryAreaId: dto.deliveryAreaId,
        },
      },
      include: { deliveryArea: { select: { isActive: true } } },
    });

    if (!coverage) {
      throw new NotFoundException(
        'This supplier does not deliver to the selected area',
      );
    }

    // A paused area keeps its existing orders but takes no new ones — the same
    // message a buyer gets when posting a request there.
    if (!coverage.deliveryArea.isActive) {
      throw new NotFoundException('Delivery area not available');
    }

    const fuelTypeIds = dto.items.map((item) => item.fuelTypeId);
    const listings = await this.prisma.supplierFuel.findMany({
      where: {
        supplierProfileId: supplier.id,
        fuelTypeId: { in: fuelTypeIds },
      },
      include: { fuelType: true },
    });
    const listingByFuelType = new Map(
      listings.map((listing) => [listing.fuelTypeId, listing]),
    );

    let subtotal = new Prisma.Decimal(0);
    const itemsData: Array<{
      fuelTypeId: string;
      pricePerLitre: Prisma.Decimal;
      quantity: Prisma.Decimal;
      lineTotal: Prisma.Decimal;
    }> = [];

    for (const item of dto.items) {
      const listing = listingByFuelType.get(item.fuelTypeId);

      // A suspended listing or a retired fuel type must not be orderable, however
      // the customer arrived at it.
      if (
        !listing ||
        !listing.isAvailable ||
        listing.isSuspended ||
        !listing.fuelType.isActive
      ) {
        throw new NotFoundException(
          `${listing?.fuelType.name ?? 'Requested fuel type'} is not available from this supplier`,
        );
      }

      const quantity = new Prisma.Decimal(item.quantity);

      if (quantity.lessThan(listing.minimumOrderLitres)) {
        throw new BadRequestException(
          `${listing.fuelType.name} has a minimum order of ${listing.minimumOrderLitres.toString()}L`,
        );
      }

      if (quantity.greaterThan(listing.availableQuantity)) {
        throw new BadRequestException(
          `Only ${listing.availableQuantity.toString()}L of ${listing.fuelType.name} is available`,
        );
      }

      const lineTotal = listing.pricePerLitre.times(quantity);
      subtotal = subtotal.plus(lineTotal);

      itemsData.push({
        fuelTypeId: item.fuelTypeId,
        pricePerLitre: listing.pricePerLitre,
        quantity,
        lineTotal,
      });
    }

    const totalAmount = subtotal.plus(coverage.deliveryFee);

    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.create({
        data: {
          customerId,
          supplierProfileId: supplier.id,
          deliveryAreaId: dto.deliveryAreaId,
          deliveryAddress: dto.deliveryAddress.trim(),
          deliveryFee: coverage.deliveryFee,
          subtotal,
          totalAmount,
          status: OrderStatus.PENDING,
          items: { create: itemsData },
        },
        include: ORDER_INCLUDE,
      });

      await tx.orderStatusHistory.create({
        data: {
          orderId: order.id,
          fromStatus: null,
          toStatus: OrderStatus.PENDING,
        },
      });

      return order;
    });
  }

  async getMyOrders(customerId: string) {
    return this.prisma.order.findMany({
      where: { customerId },
      include: ORDER_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
  }

  async getSupplierOrders(userId: string) {
    const supplier = await this.prisma.supplierProfile.findUnique({
      where: { userId },
    });

    if (!supplier) {
      throw new NotFoundException('Supplier profile not found');
    }

    return this.prisma.order.findMany({
      where: { supplierProfileId: supplier.id },
      include: ORDER_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Marketplace-wide order oversight for admins. */
  async listAllForAdmin(status?: OrderStatus) {
    return this.prisma.order.findMany({
      where: status ? { status } : {},
      include: {
        ...ORDER_INCLUDE,
        customer: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        payment: { select: { status: true, paidAt: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  async getOrderById(orderId: string, userId: string, role: Role) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: ORDER_INCLUDE,
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    const isOwner =
      order.customerId === userId || order.supplier.userId === userId;

    if (!isOwner && role !== Role.ADMIN) {
      throw new ForbiddenException('You do not have access to this order');
    }

    return order;
  }

  async cancelOrder(orderId: string, customerId: string, reason?: string) {
    return this.updateOrderStatus(
      orderId,
      OrderStatus.CANCELLED,
      customerId,
      Role.CUSTOMER,
      reason,
    );
  }

  /**
   * The single entry point for every user-initiated status change.
   * Validates the transition itself (§27) and that this actor may request it (§26),
   * then applies the side effects that belong to the target status.
   */
  async updateOrderStatus(
    orderId: string,
    target: OrderStatus,
    actorUserId: string,
    actorRole: Role,
    reason?: string,
  ) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        items: true,
        // `companyName` is here for the notification wording — a buyer wants to
        // know which depot confirmed or rejected, not an opaque id.
        supplier: { select: { userId: true, companyName: true } },
        payment: true,
      },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    const actor = this.resolveActor(order, actorUserId, actorRole);

    if (!actor) {
      throw new ForbiddenException('You do not have access to this order');
    }

    if (!canTransitionOrderStatus(order.status, target)) {
      throw new BadRequestException(
        `An order cannot move from ${order.status} to ${target}`,
      );
    }

    const allowedActors = getAllowedActors(order.status, target);

    if (!allowedActors.includes(actor)) {
      throw new ForbiddenException(
        `You are not allowed to move this order to ${target}`,
      );
    }

    const trimmedReason = reason?.trim() || null;

    const updated = await this.prisma.$transaction(async (tx) => {
      const data: Prisma.OrderUpdateManyMutationInput = { status: target };

      if (target === OrderStatus.CONFIRMED) {
        data.confirmedAt = new Date();
      }

      if (target === OrderStatus.DELIVERED) {
        data.deliveredAt = new Date();
      }

      if (target === OrderStatus.CANCELLED) {
        data.cancellationReason = trimmedReason;
      }

      const restoresStock =
        target === OrderStatus.REJECTED && order.inventoryDeducted;

      if (target === OrderStatus.REJECTED) {
        data.rejectionReason = trimmedReason;
        if (restoresStock) data.inventoryDeducted = false;
      }

      // Everything above was checked against the order as it was read. Apply the
      // change only if it is still in that state: a double-click, two people
      // acting at once, or a payment landing mid-cancel must not apply twice or
      // overwrite each other.
      const claimed = await tx.order.updateMany({
        where: { id: orderId, status: order.status },
        data,
      });

      if (claimed.count === 0) {
        throw new ConflictException(
          'This order was updated by someone else. Refresh and try again.',
        );
      }

      // The sale did not happen — put back exactly what payment confirmation took.
      if (restoresStock) {
        for (const item of order.items) {
          await tx.supplierFuel.updateMany({
            where: {
              supplierProfileId: order.supplierProfileId,
              fuelTypeId: item.fuelTypeId,
            },
            data: { availableQuantity: { increment: item.quantity } },
          });
        }
      }

      await tx.orderStatusHistory.create({
        data: {
          orderId,
          fromStatus: order.status,
          toStatus: target,
          note: trimmedReason,
        },
      });

      // A rejected order that was already paid for owes the customer a refund.
      if (
        target === OrderStatus.REJECTED &&
        order.payment?.status === PaymentStatus.SUCCESS
      ) {
        await tx.order.update({
          where: { id: orderId },
          data: { status: OrderStatus.REFUND_PENDING },
        });

        await tx.orderStatusHistory.create({
          data: {
            orderId,
            fromStatus: OrderStatus.REJECTED,
            toStatus: OrderStatus.REFUND_PENDING,
            note: 'Order was paid for — refund owed',
          },
        });
      }

      return tx.order.findUnique({
        where: { id: orderId },
        include: ORDER_INCLUDE,
      });
    });

    // Outside the transaction, and never allowed to fail the status change.
    try {
      const notice = this.orderNotification(target, {
        id: orderId,
        customerId: order.customerId,
        rejectionReason: trimmedReason ?? null,
        supplier: order.supplier,
      });

      if (notice) await this.notifications.notify(notice);
    } catch (error) {
      this.logger.error(
        `Could not notify on order ${orderId} → ${target}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    return updated;
  }

  private resolveActor(
    order: { customerId: string; supplier: { userId: string } },
    userId: string,
    role: Role,
  ): OrderActor | null {
    if (order.customerId === userId) {
      return 'CUSTOMER';
    }

    if (order.supplier.userId === userId) {
      return 'SUPPLIER';
    }

    if (role === Role.ADMIN) {
      return 'ADMIN';
    }

    return null;
  }
}
