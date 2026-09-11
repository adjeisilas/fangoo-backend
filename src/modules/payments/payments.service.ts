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

      if (order.status === OrderStatus.PENDING) {
        await tx.order.update({
          where: { id: order.id },
          data: { status: OrderStatus.PAYMENT_PENDING },
        });
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
   * Safe to call repeatedly — both the browser callback and the webhook funnel through here.
   */
  async confirmPayment(reference: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { reference },
      include: { order: { include: { items: true } } },
    });

    if (!payment) {
      throw new NotFoundException('Payment reference not found');
    }

    if (SETTLED_PAYMENT_STATUSES.includes(payment.status)) {
      return { payment, alreadyProcessed: true };
    }

    const verification = await this.paystack.verifyTransaction(reference);

    if (verification.status !== 'success') {
      const updated = await this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          status:
            verification.status === 'abandoned'
              ? PaymentStatus.ABANDONED
              : PaymentStatus.FAILED,
          failureReason: verification.gatewayResponse,
          providerReference: verification.reference,
        },
      });

      return { payment: updated, alreadyProcessed: false };
    }

    // Never trust the amount the client (or the redirect) reports — compare against our own total.
    const expectedMinorUnits = this.paystack.expectedMinorUnits(
      payment.amount.toString(),
    );

    if (verification.amount !== expectedMinorUnits) {
      this.logger.error(
        `Payment amount mismatch for ${reference}: expected ${expectedMinorUnits}, got ${verification.amount}`,
      );

      const updated = await this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: PaymentStatus.FAILED,
          failureReason: 'Amount paid did not match the order total',
          providerReference: verification.reference,
        },
      });

      return { payment: updated, alreadyProcessed: false };
    }

    const order = payment.order;

    return this.prisma.$transaction(async (tx) => {
      const paidAt = verification.paidAt
        ? new Date(verification.paidAt)
        : new Date();

      const updatedPayment = await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: PaymentStatus.SUCCESS,
          providerReference: verification.reference,
          paidAt,
          failureReason: null,
        },
      });

      // Inventory is owned by the server and only decremented once money is confirmed.
      // The conditional update is atomic, so concurrent confirmations cannot oversell.
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

      const path: OrderStatus[] = [];
      if (order.status === OrderStatus.PENDING) {
        path.push(OrderStatus.PAYMENT_PENDING);
      }
      path.push(OrderStatus.PAID, OrderStatus.AWAITING_CONFIRMATION);

      let current = order.status;
      for (const next of path) {
        if (!canTransitionOrderStatus(current, next)) {
          this.logger.error(
            `Order ${order.id} paid but cannot move ${current} -> ${next}; needs manual review`,
          );
          await tx.orderStatusHistory.create({
            data: {
              orderId: order.id,
              fromStatus: current,
              toStatus: current,
              note: `Payment ${reference} succeeded but the order was in ${current}; manual review required`,
            },
          });
          return { payment: updatedPayment, alreadyProcessed: false };
        }

        await tx.order.update({
          where: { id: order.id },
          data: {
            status: next,
            ...(next === OrderStatus.PAID
              ? { paidAt, inventoryDeducted: shortfalls.length === 0 }
              : {}),
          },
        });

        await tx.orderStatusHistory.create({
          data: {
            orderId: order.id,
            fromStatus: current,
            toStatus: next,
            note:
              next === OrderStatus.AWAITING_CONFIRMATION &&
              shortfalls.length > 0
                ? 'Stock ran short after payment — supplier review required'
                : null,
          },
        });

        current = next;
      }

      return { payment: updatedPayment, alreadyProcessed: false };
    });
  }

  /**
   * Browser-facing wrapper around `confirmPayment`. The webhook path is trusted via
   * its signature; this path must instead prove the caller owns the order.
   */
  async confirmPaymentForCustomer(reference: string, customerId: string) {
    const existing = await this.prisma.payment.findUnique({
      where: { reference },
      include: { order: { select: { customerId: true } } },
    });

    if (!existing) {
      throw new NotFoundException('Payment reference not found');
    }

    if (existing.order.customerId !== customerId) {
      throw new ForbiddenException('You do not have access to this payment');
    }

    return this.confirmPayment(reference);
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
      await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: PaymentStatus.REFUNDED,
          failureReason: reason?.trim() || null,
        },
      });

      const order = await tx.order.update({
        where: { id: orderId },
        data: { status: OrderStatus.REFUNDED },
      });

      await tx.orderStatusHistory.create({
        data: {
          orderId,
          fromStatus: from,
          toStatus: OrderStatus.REFUNDED,
          note: reason?.trim() || 'Refunded to the buyer',
        },
      });

      return {
        orderId: order.id,
        status: order.status,
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
