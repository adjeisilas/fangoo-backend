import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { DeliveryAreasService } from './delivery-areas.service.js';
import { CreateDeliveryAreaDto } from './dto/create-delivery-area.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { Public } from '../auth/decorators/public.decorator.js';
import { Role } from '../../generated/prisma/client.js';

@Controller('delivery-areas')
export class DeliveryAreasController {
  constructor(
    private readonly deliveryAreasService: DeliveryAreasService,
  ) {}

  @Public()
  @Get()
  async getAreas() {
    return this.deliveryAreasService.findAll();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Post()
  async createArea(@Body() dto: CreateDeliveryAreaDto) {
    return this.deliveryAreasService.create(dto);
  }
}
