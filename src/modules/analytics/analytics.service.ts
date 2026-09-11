import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  OfferStatus,
  OrderStatus,
  PaymentStatus,
  RequestStatus,
  Role,
  VerificationStatus,
} from '../../generated/prisma/client.js';

/** Orders that represent money actually earned. */
const REVENUE_STATUSES: OrderStatus[] = [
  OrderStatus.PAID,
  OrderStatus.AWAITING_CONFIRMATION,
  OrderStatus.CONFIRMED,
  OrderStatus.PREPARING,
  OrderStatus.OUT_FOR_DELIVERY,
  OrderStatus.DELIVERED,
];

/** Orders currently on the road or being made ready. */
const IN_FLIGHT_STATUSES: OrderStatus[] = [
  OrderStatus.CONFIRMED,
  OrderStatus.PREPARING,
  OrderStatus.OUT_FOR_DELIVERY,
];

export interface Metric {
  value: number;
  previous: number;
  /** Percentage change vs the previous window; null when there is no baseline. */
  changePercent: number | null;
}

const metric = (value: number, previous: number): Metric => ({
  value,
  previous,
  // Growth from zero is not "infinite percent" — it has no meaningful baseline.
  changePercent:
    previous === 0 ? null : Number((((value - previous) / previous) * 100).toFixed(1)),
});

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Returns [currentStart, previousStart] for a trailing window of `days`. */
  private windows(days: number) {
    const now = Date.now();
    const span = days * 86_400_000;
    return {
      currentFrom: new Date(now - span),
      previousFrom: new Date(now - span * 2),
      previousTo: new Date(now - span),
    };
  }

  async getAdminOverview(days = 30) {
    const { currentFrom, previousFrom, previousTo } = this.windows(days);

    const [
      ordersNow,
      ordersPrev,
      revenueNow,
      revenuePrev,
      activeSuppliers,
      activeBuyers,
      activeDeliveries,
      pendingVerification,
      openRequests,
      paymentTotals,
    ] = await Promise.all([
      this.prisma.order.count({ where: { createdAt: { gte: currentFrom } } }),
      this.prisma.order.count({
        where: { createdAt: { gte: previousFrom, lt: previousTo } },
      }),
      this.prisma.order.aggregate({
        _sum: { totalAmount: true },
        where: {
          createdAt: { gte: currentFrom },
          status: { in: REVENUE_STATUSES },
        },
      }),
      this.prisma.order.aggregate({
        _sum: { totalAmount: true },
        where: {
          createdAt: { gte: previousFrom, lt: previousTo },
          status: { in: REVENUE_STATUSES },
        },
      }),
      this.prisma.supplierProfile.count({
        where: {
          verificationStatus: VerificationStatus.VERIFIED,
          isAcceptingOrders: true,
        },
      }),
      this.prisma.user.count({
        where: { role: Role.CUSTOMER, isActive: true },
      }),
      this.prisma.order.count({ where: { status: { in: IN_FLIGHT_STATUSES } } }),
      this.prisma.supplierProfile.count({
        where: { verificationStatus: VerificationStatus.PENDING },
      }),
      this.prisma.fuelRequest.count({ where: { status: RequestStatus.OPEN } }),
      this.prisma.payment.groupBy({
        by: ['status'],
        _sum: { amount: true },
        _count: { _all: true },
      }),
    ]);

    const payments = Object.fromEntries(
      paymentTotals.map((row) => [
        row.status,
        { total: Number(row._sum.amount ?? 0), count: row._count._all },
      ]),
    ) as Record<PaymentStatus, { total: number; count: number } | undefined>;

    return {
      windowDays: days,
      orders: metric(ordersNow, ordersPrev),
      revenue: metric(
        Number(revenueNow._sum.totalAmount ?? 0),
        Number(revenuePrev._sum.totalAmount ?? 0),
      ),
      activeSuppliers,
      activeBuyers,
      activeDeliveries,
      pendingVerification,
      openRequests,
      payments: {
        processed: payments.SUCCESS?.total ?? 0,
        pending: payments.PENDING?.total ?? 0,
        failed: payments.FAILED?.total ?? 0,
        abandoned: payments.ABANDONED?.total ?? 0,
      },
    };
  }

  /** Daily revenue/order series for the marketplace chart. */
  async getAdminSeries(days = 30) {
    const from = new Date(Date.now() - days * 86_400_000);

    const orders = await this.prisma.order.findMany({
      where: { createdAt: { gte: from } },
      select: { createdAt: true, totalAmount: true, status: true },
      orderBy: { createdAt: 'asc' },
    });

    const buckets = new Map<string, { orders: number; revenue: number }>();

    for (let i = days - 1; i >= 0; i -= 1) {
      const key = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10);
      buckets.set(key, { orders: 0, revenue: 0 });
    }

    for (const order of orders) {
      const key = order.createdAt.toISOString().slice(0, 10);
      const bucket = buckets.get(key);
      if (!bucket) continue;

      bucket.orders += 1;
      if (REVENUE_STATUSES.includes(order.status)) {
        bucket.revenue += Number(order.totalAmount);
      }
    }

    return [...buckets.entries()].map(([date, value]) => ({ date, ...value }));
  }

  async getSupplierOverview(userId: string, days = 30) {
    const supplier = await this.prisma.supplierProfile.findUnique({
      where: { userId },
      select: { id: true },
    });

    if (!supplier) throw new NotFoundException('Supplier profile not found');

    const { currentFrom, previousFrom, previousTo } = this.windows(days);
    const scope = { supplierProfileId: supplier.id };

    const [
      salesNow,
      salesPrev,
      ordersNow,
      ordersPrev,
      pendingOrders,
      activeDeliveries,
      activeOffers,
      acceptedOffers,
      inventory,
    ] = await Promise.all([
      this.prisma.order.aggregate({
        _sum: { totalAmount: true },
        where: {
          ...scope,
          createdAt: { gte: currentFrom },
          status: { in: REVENUE_STATUSES },
        },
      }),
      this.prisma.order.aggregate({
        _sum: { totalAmount: true },
        where: {
          ...scope,
          createdAt: { gte: previousFrom, lt: previousTo },
          status: { in: REVENUE_STATUSES },
        },
      }),
      this.prisma.order.count({
        where: { ...scope, createdAt: { gte: currentFrom } },
      }),
      this.prisma.order.count({
        where: { ...scope, createdAt: { gte: previousFrom, lt: previousTo } },
      }),
      this.prisma.order.count({
        where: { ...scope, status: OrderStatus.AWAITING_CONFIRMATION },
      }),
      this.prisma.order.count({
        where: { ...scope, status: { in: IN_FLIGHT_STATUSES } },
      }),
      this.prisma.offer.count({
        where: { supplierProfileId: supplier.id, status: OfferStatus.PENDING },
      }),
      this.prisma.offer.count({
        where: { supplierProfileId: supplier.id, status: OfferStatus.ACCEPTED },
      }),
      this.prisma.supplierFuel.aggregate({
        _sum: { availableQuantity: true },
        where: { supplierProfileId: supplier.id, isAvailable: true },
      }),
    ]);

    return {
      windowDays: days,
      sales: metric(
        Number(salesNow._sum.totalAmount ?? 0),
        Number(salesPrev._sum.totalAmount ?? 0),
      ),
      orders: metric(ordersNow, ordersPrev),
      pendingOrders,
      activeDeliveries,
      activeOffers,
      acceptedOffers,
      availableInventory: Number(inventory._sum.availableQuantity ?? 0),
    };
  }

  async getSupplierSeries(userId: string, days = 30) {
    const supplier = await this.prisma.supplierProfile.findUnique({
      where: { userId },
      select: { id: true },
    });

    if (!supplier) throw new NotFoundException('Supplier profile not found');

    const from = new Date(Date.now() - days * 86_400_000);

    const orders = await this.prisma.order.findMany({
      where: { supplierProfileId: supplier.id, createdAt: { gte: from } },
      select: { createdAt: true, totalAmount: true, status: true },
      orderBy: { createdAt: 'asc' },
    });

    const buckets = new Map<string, { orders: number; revenue: number }>();

    for (let i = days - 1; i >= 0; i -= 1) {
      const key = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10);
      buckets.set(key, { orders: 0, revenue: 0 });
    }

    for (const order of orders) {
      const key = order.createdAt.toISOString().slice(0, 10);
      const bucket = buckets.get(key);
      if (!bucket) continue;

      bucket.orders += 1;
      if (REVENUE_STATUSES.includes(order.status)) {
        bucket.revenue += Number(order.totalAmount);
      }
    }

    return [...buckets.entries()].map(([date, value]) => ({ date, ...value }));
  }
}
