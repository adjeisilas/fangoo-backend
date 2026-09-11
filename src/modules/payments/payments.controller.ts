import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  Req,
  Headers,
  HttpCode,
  HttpStatus,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { PaymentsService } from './payments.service.js';
import { RefundOrderDto } from './dto/refund-order.dto.js';
import {
  RateLimitGuard,
  RateLimit,
} from '../../common/guards/rate-limit.guard.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { Public } from '../auth/decorators/public.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Role, PaymentStatus } from '../../generated/prisma/client.js';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @UseGuards(JwtAuthGuard)
  @Post('orders/:orderId/initialize')
  async initializePayment(
    @CurrentUser('id') userId: string,
    @Param('orderId') orderId: string,
  ) {
    return this.paymentsService.initializePayment(orderId, userId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('verify/:reference')
  async verifyPayment(
    @CurrentUser('id') userId: string,
    @Param('reference') reference: string,
  ) {
    const { payment } = await this.paymentsService.confirmPaymentForCustomer(
      reference,
      userId,
    );

    return {
      reference: payment.reference,
      orderId: payment.orderId,
      status: payment.status,
      paidAt: payment.paidAt,
      failureReason: payment.failureReason,
    };
  }

  @UseGuards(JwtAuthGuard)
  @Get('orders/:orderId')
  async getPaymentForOrder(
    @CurrentUser('id') userId: string,
    @Param('orderId') orderId: string,
  ) {
    return this.paymentsService.getPaymentForOrder(orderId, userId);
  }

  /**
   * Admin-only, and rate limited: a refund moves real money, so a loop or a stuck
   * retry must not be able to hammer the provider.
   */
  @UseGuards(JwtAuthGuard, RolesGuard, RateLimitGuard)
  @Roles(Role.ADMIN)
  @RateLimit({ limit: 20, windowMs: 60 * 60 * 1000 })
  @Post('orders/:orderId/refund')
  async refundOrder(
    @Param('orderId') orderId: string,
    @Body() dto: RefundOrderDto,
  ) {
    return this.paymentsService.refundOrder(orderId, dto.reason);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Get('admin/all')
  async listAllForAdmin(@Query('status') status?: PaymentStatus) {
    return this.paymentsService.listAllForAdmin(status);
  }

  @Public()
  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  async handleWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-paystack-signature') signature?: string,
  ) {
    if (!req.rawBody) {
      throw new BadRequestException('Missing request body');
    }

    return this.paymentsService.handleWebhook(req.rawBody, signature);
  }
}
