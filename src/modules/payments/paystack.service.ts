import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'node:crypto';

const PAYSTACK_BASE_URL = 'https://api.paystack.co';

/** Long enough for a slow card network, short enough to free the request. */
const PAYSTACK_TIMEOUT_MS = 15_000;

export interface PaystackInitializeParams {
  email: string;
  /** Amount in the major currency unit (e.g. GHS 182.50). Converted to minor units here. */
  amount: string;
  currency: string;
  reference: string;
  callbackUrl: string;
  /** Sent as metadata, so a payment can be matched to its order by any reference. */
  orderId: string;
}

export interface PaystackInitializeResult {
  authorizationUrl: string;
  accessCode: string;
  reference: string;
}

export interface PaystackRefundResult {
  /** Paystack's own refund id, stored so a refund can be traced back later. */
  id: number | null;
  status: string;
  /** Amount refunded, in minor units. */
  amount: number;
  currency: string;
}

export interface PaystackVerifyResult {
  status: string;
  reference: string;
  /** Amount in minor units (pesewas for GHS) as returned by Paystack. */
  amount: number;
  currency: string;
  paidAt: string | null;
  gatewayResponse: string | null;
  /** The order id sent at initialisation, or null for transactions without one. */
  orderId: string | null;
}

/**
 * Isolates the Paystack integration (fangoo-project skill §69). Nothing outside this
 * service should know the provider's request/response shapes or hold its credentials.
 */
@Injectable()
export class PaystackService {
  private readonly logger = new Logger(PaystackService.name);

  constructor(private readonly configService: ConfigService) {}

  private get secretKey(): string {
    const key = this.configService.get<string>('PAYSTACK_SECRET_KEY');

    if (!key) {
      throw new InternalServerErrorException(
        'Payment provider is not configured',
      );
    }

    return key;
  }

  /**
   * One call to Paystack, with the failure handling every caller needs.
   *
   * The timeout is the point: `fetch` waits indefinitely by default, so a
   * provider that stops answering would hold a request — and its database
   * connection — open until the client gave up.
   */
  private async request<T>(
    path: string,
    label: string,
    init: { method?: string; body?: unknown } = {},
  ): Promise<{ ok: boolean; message?: string; data?: T }> {
    let response: Response;

    try {
      response = await fetch(`${PAYSTACK_BASE_URL}${path}`, {
        method: init.method ?? 'GET',
        headers: {
          Authorization: `Bearer ${this.secretKey}`,
          ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(init.body ? { body: JSON.stringify(init.body) } : {}),
        signal: AbortSignal.timeout(PAYSTACK_TIMEOUT_MS),
      });
    } catch (error) {
      this.logger.error(
        `Paystack ${label} could not be reached: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new ServiceUnavailableException(
        'The payment provider is not responding. Please try again.',
      );
    }

    // A gateway error page is not JSON, and must not surface as a parse crash.
    const payload = (await response.json().catch(() => ({}))) as {
      status?: boolean;
      message?: string;
      data?: T;
    };

    return {
      ok: response.ok && !!payload.status && !!payload.data,
      message: payload.message ?? response.statusText,
      data: payload.data,
    };
  }

  /** Paystack expects amounts in the smallest currency unit (pesewas for GHS). */
  private toMinorUnits(amount: string): number {
    return Math.round(Number(amount) * 100);
  }

  async initializeTransaction(
    params: PaystackInitializeParams,
  ): Promise<PaystackInitializeResult> {
    const body = {
      email: params.email,
      amount: this.toMinorUnits(params.amount),
      currency: params.currency,
      reference: params.reference,
      callback_url: params.callbackUrl,
      metadata: JSON.stringify({ order_id: params.orderId }),
    };

    const { ok, message, data } = await this.request<{
      authorization_url: string;
      access_code: string;
      reference: string;
    }>('/transaction/initialize', 'initialize', { method: 'POST', body });

    if (!ok || !data) {
      this.logger.error(`Paystack initialize failed: ${message}`);
      throw new InternalServerErrorException(
        'Could not start the payment. Please try again.',
      );
    }

    return {
      authorizationUrl: data.authorization_url,
      accessCode: data.access_code,
      reference: data.reference,
    };
  }

  async verifyTransaction(reference: string): Promise<PaystackVerifyResult> {
    const { ok, message, data } = await this.request<{
      status: string;
      reference: string;
      amount: number;
      currency: string;
      paid_at: string | null;
      gateway_response: string | null;
      metadata?: unknown;
    }>(`/transaction/verify/${encodeURIComponent(reference)}`, 'verify');

    if (!ok || !data) {
      this.logger.error(`Paystack verify failed: ${message}`);
      throw new InternalServerErrorException(
        'Could not verify the payment. Please try again.',
      );
    }

    return {
      status: data.status,
      reference: data.reference,
      amount: data.amount,
      currency: data.currency,
      paidAt: data.paid_at,
      gatewayResponse: data.gateway_response,
      orderId: readOrderId(data.metadata),
    };
  }

  /**
   * Returns a captured transaction to the payer.
   *
   * Paystack settles refunds asynchronously, so a successful response means the
   * refund was *accepted*, not that the money has landed. The caller records the
   * order as refunded on acceptance — the alternative is leaving a buyer's money in
   * limbo while waiting on a provider-side queue.
   */
  async refundTransaction(
    reference: string,
    amount: string,
    reason?: string,
  ): Promise<PaystackRefundResult> {
    const { ok, message, data } = await this.request<{
      id?: number;
      status?: string;
      amount?: number;
      currency?: string;
    }>('/refund', 'refund', {
      method: 'POST',
      body: {
        transaction: reference,
        amount: this.toMinorUnits(amount),
        ...(reason ? { merchant_note: reason } : {}),
      },
    });

    if (!ok || !data) {
      this.logger.error(`Paystack refund failed for ${reference}: ${message}`);
      // Surfaced verbatim: an admin needs to know *why* the provider refused.
      throw new BadRequestException(
        message ?? 'The refund was refused by the payment provider.',
      );
    }

    return {
      id: data.id ?? null,
      status: data.status ?? 'pending',
      amount: data.amount ?? this.toMinorUnits(amount),
      currency: data.currency ?? 'GHS',
    };
  }

  /** Verifies the `x-paystack-signature` header against the raw request body. */
  verifyWebhookSignature(rawBody: Buffer, signature?: string): boolean {
    if (!signature) {
      return false;
    }

    const expected = createHmac('sha512', this.secretKey)
      .update(rawBody)
      .digest('hex');

    const expectedBuffer = Buffer.from(expected, 'utf8');
    const receivedBuffer = Buffer.from(signature, 'utf8');

    if (expectedBuffer.length !== receivedBuffer.length) {
      return false;
    }

    return timingSafeEqual(expectedBuffer, receivedBuffer);
  }

  expectedMinorUnits(amount: string): number {
    return this.toMinorUnits(amount);
  }
}

/**
 * Paystack returns metadata as an object, or as the JSON string it was sent as,
 * depending on the endpoint. Anything unexpected reads as "no order id".
 */
export function readOrderId(metadata: unknown): string | null {
  let value = metadata;

  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }

  const orderId = (value as { order_id?: unknown } | null)?.order_id;
  return typeof orderId === 'string' && orderId.length > 0 ? orderId : null;
}
