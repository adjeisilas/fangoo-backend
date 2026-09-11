import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { FuelTypesService } from './fuel-types.service.js';
import { CreateFuelTypeDto } from './dto/create-fuel-type.dto.js';
import { UpdateFuelTypeDto } from './dto/update-fuel-type.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { Public } from '../auth/decorators/public.decorator.js';
import { Role } from '../../generated/prisma/client.js';

@Controller('fuel-types')
export class FuelTypesController {
  constructor(private readonly fuelTypesService: FuelTypesService) {}

  @Public()
  @Get()
  async getFuelTypes() {
    return this.fuelTypesService.findAll();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Get('admin/all')
  async listAllForAdmin() {
    return this.fuelTypesService.findAllForAdmin();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Post()
  async createFuelType(@Body() dto: CreateFuelTypeDto) {
    return this.fuelTypesService.create(dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Patch(':id')
  async updateFuelType(
    @Param('id') id: string,
    @Body() dto: UpdateFuelTypeDto,
  ) {
    return this.fuelTypesService.update(id, dto);
  }
}
