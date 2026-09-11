import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'node:crypto';

const PAYSTACK_BASE_URL = 'https://api.paystack.co';

export interface PaystackInitializeParams {
  email: string;
  /** Amount in the major currency unit (e.g. GHS 182.50). Converted to minor units here. */
  amount: string;
  currency: string;
  reference: string;
  callbackUrl: string;
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
    };

    const response = await fetch(
      `${PAYSTACK_BASE_URL}/transaction/initialize`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.secretKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      },
    );

    const payload = (await response.json()) as {
      status?: boolean;
      message?: string;
      data?: {
        authorization_url: string;
        access_code: string;
        reference: string;
      };
    };

    if (!response.ok || !payload.status || !payload.data) {
      this.logger.error(
        `Paystack initialize failed: ${payload.message ?? response.statusText}`,
      );
      throw new InternalServerErrorException(
        'Could not start the payment. Please try again.',
      );
    }

    return {
      authorizationUrl: payload.data.authorization_url,
      accessCode: payload.data.access_code,
      reference: payload.data.reference,
    };
  }

  async verifyTransaction(reference: string): Promise<PaystackVerifyResult> {
    const response = await fetch(
      `${PAYSTACK_BASE_URL}/transaction/verify/${encodeURIComponent(reference)}`,
      {
        headers: { Authorization: `Bearer ${this.secretKey}` },
      },
    );

    const payload = (await response.json()) as {
      status?: boolean;
      message?: string;
      data?: {
        status: string;
        reference: string;
        amount: number;
        currency: string;
        paid_at: string | null;
        gateway_response: string | null;
      };
    };

    if (!response.ok || !payload.status || !payload.data) {
      this.logger.error(
        `Paystack verify failed: ${payload.message ?? response.statusText}`,
      );
      throw new InternalServerErrorException(
        'Could not verify the payment. Please try again.',
      );
    }

    return {
      status: payload.data.status,
      reference: payload.data.reference,
      amount: payload.data.amount,
      currency: payload.data.currency,
      paidAt: payload.data.paid_at,
      gatewayResponse: payload.data.gateway_response,
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
    const response = await fetch(`${PAYSTACK_BASE_URL}/refund`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        transaction: reference,
        amount: this.toMinorUnits(amount),
        ...(reason ? { merchant_note: reason } : {}),
      }),
    });

    const payload = (await response.json()) as {
      status?: boolean;
      message?: string;
      data?: {
        id?: number;
        status?: string;
        amount?: number;
        currency?: string;
      };
    };

    if (!response.ok || !payload.status || !payload.data) {
      this.logger.error(
        `Paystack refund failed for ${reference}: ${payload.message ?? response.statusText}`,
      );
      // Surfaced verbatim: an admin needs to know *why* the provider refused.
      throw new BadRequestException(
        payload.message ?? 'The refund was refused by the payment provider.',
      );
    }

    return {
      id: payload.data.id ?? null,
      status: payload.data.status ?? 'pending',
      amount: payload.data.amount ?? this.toMinorUnits(amount),
      currency: payload.data.currency ?? 'GHS',
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
