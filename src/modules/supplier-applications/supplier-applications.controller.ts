import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { Public } from '../auth/decorators/public.decorator.js';
import { writeRefreshTokenCookie } from '../auth/refresh-token-cookie.js';
import {
  RateLimit,
  RateLimitGuard,
} from '../../common/guards/rate-limit.guard.js';
import { SupplierApplicationsService } from './supplier-applications.service.js';
import { CreateSupplierApplicationDto } from './dto/create-supplier-application.dto.js';

@Controller('supplier-applications')
export class SupplierApplicationsController {
  constructor(private readonly applications: SupplierApplicationsService) {}

  /**
   * Creates a supplier account, its depot (PENDING verification) and its
   * initial delivery coverage in one step, then signs the applicant in.
   * Rate-limited like registration, since it creates an account.
   */
  @Public()
  @UseGuards(RateLimitGuard)
  @RateLimit({ limit: 5, windowMs: 60 * 60 * 1000 })
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async apply(
    @Body() dto: CreateSupplierApplicationDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { supplierProfileId, verificationStatus, session } =
      await this.applications.apply(dto);

    if (session) {
      writeRefreshTokenCookie(res, session.tokens.refreshToken);
    }

    return {
      supplierProfileId,
      verificationStatus,
      sessionStarted: session !== null,
      user: session?.user ?? null,
      accessToken: session?.tokens.accessToken ?? null,
      refreshToken: session?.tokens.refreshToken ?? null,
    };
  }
}
