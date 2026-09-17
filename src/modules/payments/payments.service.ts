import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  OrderSource,
  OrderStatus,
  PaymentStatus,
  Prisma,
} from '../../generated/prisma/client.js';
import { canTransitionOrderStatus } from '../../common/constants/order-status-transitions.js';
import { PaystackService } from './paystack.service.js';

/** Statuses an order may be in when a payment is (re)started. */
const PAYABLE_STATUSES: OrderStatus[] = [
  OrderStatus.PENDING,
  OrderStatus.PAYMENT_PENDING,
];

/**
 * Settled states that must never be re-derived from the provider.
 *
 * REFUNDED matters as much as SUCCESS here: once a transaction is refunded,
 * Paystack stops reporting it as "success", so re-verifying a refunded payment
 * would rewrite it as FAILED and destroy the record that the buyer was repaid.
 * A buyer reloading the payment-callback page is enough to trigger it.
 */
const SETTLED_PAYMENT_STATUSES: PaymentStatus[] = [
  PaymentStatus.SUCCESS,
  PaymentStatus.REFUNDED,
];

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly paystack: PaystackService,
    private readonly configService: ConfigService,
  ) {}

  async initializePayment(orderId: string, customerId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { customer: { select: { email: true } }, payment: true },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (order.customerId !== customerId) {
      throw new ForbiddenException('You do not have access to this order');
    }

    if (!PAYABLE_STATUSES.includes(order.status)) {
      throw new BadRequestException(
        `This order can no longer be paid for (status: ${order.status})`,
      );
    }

    if (order.payment?.status === PaymentStatus.SUCCESS) {
      throw new BadRequestException('This order has already been paid for');
    }

    const reference = `fangoo_${randomUUID().replace(/-/g, '')}`;
    const currency = this.configService.get<string>('PAYSTACK_CURRENCY', 'GHS');
    const callbackUrl = this.configService.get<string>(
      'PAYSTACK_CALLBACK_URL',
      'http://localhost:3000/orders/payment-callback',
    );

    const initialized = await this.paystack.initializeTransaction({
      email: order.customer.email,
      amount: order.totalAmount.toString(),
      currency,
      reference,
      callbackUrl,
      orderId: order.id,
    });

    await this.prisma.$transaction(async (tx) => {
      await tx.payment.upsert({
        where: { orderId: order.id },
        create: {
          orderId: order.id,
          reference,
          amount: order.totalAmount,
          currency,
          status: PaymentStatus.PENDING,
          authorizationUrl: initialized.authorizationUrl,
        },
        update: {
          reference,
          amount: order.totalAmount,
          currency,
          status: PaymentStatus.PENDING,
          authorizationUrl: initialized.authorizationUrl,
          failureReason: null,
        },
      });

      // Conditional, so a cancellation that landed meanwhile is never overwritten.
      const moved =
        order.status === OrderStatus.PENDING
          ? await tx.order.updateMany({
              where: { id: order.id, status: OrderStatus.PENDING },
              data: { status: OrderStatus.PAYMENT_PENDING },
            })
          : { count: 0 };

      if (moved.count > 0) {
        await tx.orderStatusHistory.create({
          data: {
            orderId: order.id,
            fromStatus: OrderStatus.PENDING,
            toStatus: OrderStatus.PAYMENT_PENDING,
          },
        });
      }
    });

    return {
      authorizationUrl: initialized.authorizationUrl,
      reference,
    };
  }

  /**
   * Verifies a transaction with Paystack and applies the result.
   * Safe to call repeatedly, and concurrently: the browser callback and the
   * webhook both funnel through here, often at the same moment.
   *
   * With `customerId`, the caller must own the order (the browser path). The
   * webhook path is trusted through its signature instead.
   */
  async confirmPayment(reference: string, customerId?: string) {
    const { payment, verified } = await this.findPaymentFor(reference);

    if (customerId !== undefined && payment.order.customerId !== customerId) {
      throw new ForbiddenException('You do not have access to this payment');
    }

    if (SETTLED_PAYMENT_STATUSES.includes(payment.status)) {
      // Only reachable through an older reference: the order was paid twice.
      if (payment.reference !== reference && verified?.status === 'success') {
        this.logger.error(
          `Order ${payment.orderId} was paid again through ${reference} after ${payment.reference} settled; refund ${reference} manually`,
        );
      }
      return { payment, alreadyProcessed: true };
    }

    const verification =
      verified ?? (await this.paystack.verifyTransaction(reference));

    // A failed or mismatched older link says nothing about the current attempt.
    const isCurrentReference = payment.reference === reference;

    if (verification.status !== 'success') {
      if (!isCurrentReference) return { payment, alreadyProcessed: false };

      return this.recordUnpaid(payment.id, reference, {
        status:
          verification.status === 'abandoned'
            ? PaymentStatus.ABANDONED
            : PaymentStatus.FAILED,
        failureReason: verification.gatewayResponse,
        providerReference: verification.reference,
      });
    }

    // Never trust the amount the client (or the redirect) reports — compare against our own total.
    const expectedMinorUnits = this.paystack.expectedMinorUnits(
      payment.amount.toString(),
    );

    // The currency matters as much as the number: 18250 pesewas and 18250 kobo are
    // very different sums, and a checkout started in the browser can pick either.
    const amountMatches =
      verification.amount === expectedMinorUnits &&
      verification.currency?.toUpperCase() === payment.currency.toUpperCase();

    if (!amountMatches) {
      this.logger.error(
        `Payment amount mismatch for ${reference}: expected ${expectedMinorUnits} ${payment.currency}, got ${verification.amount} ${verification.currency}`,
      );

      if (!isCurrentReference) return { payment, alreadyProcessed: false };

      return this.recordUnpaid(payment.id, reference, {
        status: PaymentStatus.FAILED,
        failureReason: 'Amount paid did not match the order total',
        providerReference: verification.reference,
      });
    }

    const paidAt = verification.paidAt
      ? new Date(verification.paidAt)
      : new Date();

    return this.prisma.$transaction(async (tx) => {
      // The claim: whichever confirmation gets here first settles the payment,
      // and the other finds it settled and changes nothing. The row lock this
      // takes also makes a concurrent confirmation wait for this one to finish.
      const claimed = await tx.payment.updateMany({
        where: { id: payment.id, status: { notIn: SETTLED_PAYMENT_STATUSES } },
        data: {
          status: PaymentStatus.SUCCESS,
          // The reference that was actually paid, which is what a refund needs.
          reference,
          providerReference: verification.reference,
          paidAt,
          failureReason: null,
        },
      });

      const updatedPayment = await tx.payment.findUniqueOrThrow({
        where: { id: payment.id },
      });

      if (claimed.count === 0) {
        return { payment: updatedPayment, alreadyProcessed: true };
      }

      // Read after the claim, not before it: the order may have moved meanwhile.
      const order = await tx.order.findUniqueOrThrow({
        where: { id: payment.orderId },
        include: { items: true },
      });

      if (order.status === OrderStatus.CANCELLED) {
        await this.moveOrder(tx, order.id, order.status, OrderStatus.REFUND_PENDING, {
          note: `Paid through ${reference} after the order was cancelled — refund owed`,
        });
        this.logger.warn(`Order ${order.id} was paid after it was cancelled; refund owed`);
        return { payment: updatedPayment, alreadyProcessed: false };
      }

      const path: OrderStatus[] = [];
      if (order.status === OrderStatus.PENDING) {
        path.push(OrderStatus.PAYMENT_PENDING);
      }
      path.push(OrderStatus.PAID, OrderStatus.AWAITING_CONFIRMATION);

      const steps = path.map((to, index) => ({
        from: index === 0 ? order.status : path[index - 1]!,
        to,
      }));
      const blocked = steps.find(({ from, to }) => !canTransitionOrderStatus(from, to));

      if (blocked) {
        this.logger.error(
          `Order ${order.id} paid but cannot move ${blocked.from} -> ${blocked.to}; needs manual review`,
        );
        await tx.orderStatusHistory.create({
          data: {
            orderId: order.id,
            fromStatus: order.status,
            toStatus: order.status,
            note: `Payment ${reference} succeeded but the order was in ${order.status}; manual review required`,
          },
        });
        return { payment: updatedPayment, alreadyProcessed: false };
      }

      // Inventory is owned by the server and only decremented once money is confirmed.
      // The conditional update is atomic, so concurrent orders cannot oversell.
      const shortfalls: string[] = [];

      // Catalogue orders draw down a published listing. An RFQ order is priced by
      // agreement and may have no listing at all, so there is nothing to decrement.
      const drawsDownCatalogueStock = order.source === OrderSource.CATALOGUE;

      for (const item of drawsDownCatalogueStock ? order.items : []) {
        const result = await tx.supplierFuel.updateMany({
          where: {
            supplierProfileId: order.supplierProfileId,
            fuelTypeId: item.fuelTypeId,
            availableQuantity: { gte: item.quantity },
          },
          data: { availableQuantity: { decrement: item.quantity } },
        });

        if (result.count === 0) {
          shortfalls.push(item.fuelTypeId);
        }
      }

      for (const { from, to } of steps) {
        await this.moveOrder(tx, order.id, from, to, {
          data:
            to === OrderStatus.PAID
              ? { paidAt, inventoryDeducted: shortfalls.length === 0 }
              : {},
          note:
            to === OrderStatus.AWAITING_CONFIRMATION && shortfalls.length > 0
              ? 'Stock ran short after payment — supplier review required'
              : null,
        });
      }

      return { payment: updatedPayment, alreadyProcessed: false };
    });
  }

  /** Browser-facing entry point: the caller must own the order being paid for. */
  async confirmPaymentForCustomer(reference: string, customerId: string) {
    return this.confirmPayment(reference, customerId);
  }

  /**
   * The payment a Paystack reference belongs to.
   *
   * Starting checkout again replaces the stored reference, but the buyer can still
   * pay through the link they opened first. Paystack echoes the order id we sent
   * as metadata, so that payment is matched to its order all the same. That
   * lookup needs the verified transaction, which is returned for reuse.
   */
  private async findPaymentFor(reference: string) {
    const include = { order: { select: { customerId: true } } } as const;

    const payment = await this.prisma.payment.findUnique({
      where: { reference },
      include,
    });

    if (payment) return { payment, verified: null };

    // An unknown or malformed reference is a 404, not a provider failure.
    const verified = await this.paystack
      .verifyTransaction(reference)
      .catch(() => null);

    const byOrder = verified?.orderId
      ? await this.prisma.payment.findUnique({
          where: { orderId: verified.orderId },
          include,
        })
      : null;

    if (!verified || !byOrder) {
      throw new NotFoundException('Payment reference not found');
    }

    return { payment: byOrder, verified };
  }

  /** Records a failed attempt, unless a concurrent confirmation already settled it. */
  private async recordUnpaid(
    paymentId: string,
    reference: string,
    data: {
      status: PaymentStatus;
      failureReason: string | null;
      providerReference: string;
    },
  ) {
    await this.prisma.payment.updateMany({
      where: {
        id: paymentId,
        reference,
        status: { notIn: SETTLED_PAYMENT_STATUSES },
      },
      data,
    });

    const payment = await this.prisma.payment.findUniqueOrThrow({
      where: { id: paymentId },
    });

    return { payment, alreadyProcessed: false };
  }

  /**
   * Moves an order only if it is still where this flow found it, and records the
   * move. Otherwise the whole transaction rolls back, so a retry (Paystack
   * redelivers webhooks; the buyer can reload) starts again from the new state.
   */
  private async moveOrder(
    tx: Prisma.TransactionClient,
    orderId: string,
    from: OrderStatus,
    to: OrderStatus,
    options: {
      data?: Prisma.OrderUpdateManyMutationInput;
      note?: string | null;
    } = {},
  ) {
    const moved = await tx.order.updateMany({
      where: { id: orderId, status: from },
      data: { ...options.data, status: to },
    });

    if (moved.count === 0) {
      throw new ConflictException(
        'This order changed while it was being updated. Refresh and try again.',
      );
    }

    await tx.orderStatusHistory.create({
      data: { orderId, fromStatus: from, toStatus: to, note: options.note ?? null },
    });
  }

  async handleWebhook(rawBody: Buffer, signature?: string) {
    if (!this.paystack.verifyWebhookSignature(rawBody, signature)) {
      throw new ForbiddenException('Invalid webhook signature');
    }

    const event = JSON.parse(rawBody.toString('utf8')) as {
      event?: string;
      data?: { reference?: string };
    };

    if (event.event === 'charge.success' && event.data?.reference) {
      await this.confirmPayment(event.data.reference);
    }

    return { received: true };
  }

  async getPaymentForOrder(orderId: string, customerId: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { orderId },
      include: { order: { select: { customerId: true, status: true } } },
    });

    if (!payment) {
      throw new NotFoundException('No payment found for this order');
    }

    if (payment.order.customerId !== customerId) {
      throw new ForbiddenException('You do not have access to this payment');
    }

    return payment;
  }

  /**
   * Returns a paid-for order's money to the buyer and closes the order out.
   *
   * This is the other half of the rejection path: when a supplier rejects an order
   * that was already paid for, `OrdersService` moves it to REFUND_PENDING and owes
   * the buyer their money. Without this the order sits in that state forever.
   *
   * Admin-only, matching `ORDER_TRANSITION_ACTORS` for REFUND_PENDING → REFUNDED.
   * Stock is deliberately not touched here: rejection already put it back.
   */
  async refundOrder(orderId: string, reason?: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { orderId },
      include: { order: { select: { id: true, status: true } } },
    });

    if (!payment) {
      throw new NotFoundException('No payment found for this order');
    }

    if (payment.status === PaymentStatus.REFUNDED) {
      throw new ConflictException('This payment has already been refunded');
    }

    if (payment.status !== PaymentStatus.SUCCESS) {
      const state = payment.status.toLowerCase();
      // "A abandoned payment" — pick the article rather than hardcoding "A".
      const article = /^[aeiou]/.test(state) ? 'An' : 'A';

      throw new BadRequestException(
        `${article} ${state} payment cannot be refunded`,
      );
    }

    const from = payment.order.status;

    if (!canTransitionOrderStatus(from, OrderStatus.REFUNDED)) {
      throw new BadRequestException(
        `An order that is ${from.toLowerCase().replace(/_/g, ' ')} cannot be refunded`,
      );
    }

    // The provider call happens before the write: if Paystack refuses, nothing in
    // our database claims the buyer was paid back.
    const refund = await this.paystack.refundTransaction(
      payment.reference,
      payment.amount.toString(),
      reason,
    );

    this.logger.log(
      `Refunded ${payment.reference} (Paystack refund ${refund.id ?? 'n/a'}, status ${refund.status})`,
    );

    return this.prisma.$transaction(async (tx) => {
      // Conditional: a second admin refunding at the same moment records nothing twice.
      const settled = await tx.payment.updateMany({
        where: { id: payment.id, status: PaymentStatus.SUCCESS },
        data: {
          status: PaymentStatus.REFUNDED,
          failureReason: reason?.trim() || null,
        },
      });

      if (settled.count === 0) {
        throw new ConflictException('This payment has already been refunded');
      }

      await this.moveOrder(tx, orderId, from, OrderStatus.REFUNDED, {
        note: reason?.trim() || 'Refunded to the buyer',
      });

      return {
        orderId,
        status: OrderStatus.REFUNDED,
        reference: payment.reference,
        amount: payment.amount.toString(),
        providerRefundId: refund.id,
        providerStatus: refund.status,
      };
    });
  }

  /** Marketplace-wide payment oversight for admins. */
  async listAllForAdmin(status?: PaymentStatus) {
    return this.prisma.payment.findMany({
      where: status ? { status } : {},
      include: {
        order: {
          select: {
            id: true,
            status: true,
            source: true,
            customer: {
              select: { id: true, firstName: true, lastName: true, email: true },
            },
            supplier: { select: { id: true, companyName: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }
}
