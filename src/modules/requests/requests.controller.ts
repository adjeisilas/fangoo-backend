import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { RequestsService } from './requests.service.js';
import { CreateRequestDto } from './dto/create-request.dto.js';
import { CreateOfferDto } from './dto/create-offer.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { SanitizedUser } from '../auth/types/auth.types.js';
import { Role, RequestStatus } from '../../generated/prisma/client.js';

@Controller('requests')
@UseGuards(JwtAuthGuard)
export class RequestsController {
  constructor(private readonly requestsService: RequestsService) {}

  // ----------------- Buyer -----------------

  @Post()
  async createRequest(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateRequestDto,
  ) {
    return this.requestsService.createRequest(userId, dto);
  }

  @Get('me')
  async getMyRequests(@CurrentUser('id') userId: string) {
    return this.requestsService.getMyRequests(userId);
  }

  // ----------------- Supplier -----------------

  @Get('open')
  async getOpenRequests(@CurrentUser('id') userId: string) {
    return this.requestsService.getOpenRequestsForSupplier(userId);
  }

  @Get('offers/me')
  async getMyOffers(@CurrentUser('id') userId: string) {
    return this.requestsService.getMyOffers(userId);
  }

  @Patch('offers/:offerId/withdraw')
  async withdrawOffer(
    @CurrentUser('id') userId: string,
    @Param('offerId') offerId: string,
  ) {
    return this.requestsService.withdrawOffer(offerId, userId);
  }

  // ----------------- Admin -----------------

  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @Get('admin/all')
  async listAllForAdmin(@Query('status') status?: RequestStatus) {
    return this.requestsService.listAllForAdmin(status);
  }

  // ----------------- Per-request (dynamic routes last) -----------------

  @Get(':id')
  async getRequestById(
    @CurrentUser() user: SanitizedUser,
    @Param('id') id: string,
  ) {
    return this.requestsService.getRequestById(id, user.id, user.role);
  }

  @Patch(':id/cancel')
  async cancelRequest(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ) {
    return this.requestsService.cancelRequest(id, userId);
  }

  @Post(':id/offers')
  async submitOffer(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: CreateOfferDto,
  ) {
    return this.requestsService.submitOffer(id, userId, dto);
  }

  @Post(':id/offers/:offerId/accept')
  async acceptOffer(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Param('offerId') offerId: string,
  ) {
    return this.requestsService.acceptOffer(id, offerId, userId);
  }
}
