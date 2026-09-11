import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AnalyticsService } from './analytics.service.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Role } from '../../generated/prisma/client.js';

/** Windows the dashboards are allowed to ask for. */
const ALLOWED_DAYS = [7, 30, 90, 365];

const parseDays = (value?: string) => {
  const days = Number(value);
  return ALLOWED_DAYS.includes(days) ? days : 30;
};

@Controller('analytics')
@UseGuards(JwtAuthGuard)
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @Get('admin/overview')
  async adminOverview(@Query('days') days?: string) {
    return this.analyticsService.getAdminOverview(parseDays(days));
  }

  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @Get('admin/series')
  async adminSeries(@Query('days') days?: string) {
    return this.analyticsService.getAdminSeries(parseDays(days));
  }

  @Get('supplier/overview')
  async supplierOverview(
    @CurrentUser('id') userId: string,
    @Query('days') days?: string,
  ) {
    return this.analyticsService.getSupplierOverview(userId, parseDays(days));
  }

  @Get('supplier/series')
  async supplierSeries(
    @CurrentUser('id') userId: string,
    @Query('days') days?: string,
  ) {
    return this.analyticsService.getSupplierSeries(userId, parseDays(days));
  }
}
