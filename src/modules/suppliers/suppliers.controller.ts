import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { SuppliersService } from './suppliers.service.js';
import { CreateSupplierProfileDto } from './dto/create-supplier-profile.dto.js';
import { UpdateSupplierProfileDto } from './dto/update-supplier-profile.dto.js';
import { ConfigureDeliveryAreasDto } from './dto/configure-delivery-areas.dto.js';
import { VerifySupplierDto } from './dto/verify-supplier.dto.js';
import { UpsertFuelListingDto } from './dto/upsert-fuel-listing.dto.js';
import { UpdateFuelListingDto } from './dto/update-fuel-listing.dto.js';
import { SuspendFuelListingDto } from './dto/suspend-fuel-listing.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { Public } from '../auth/decorators/public.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Role, VerificationStatus } from '../../generated/prisma/client.js';

@Controller('suppliers')
export class SuppliersController {
  constructor(private readonly suppliersService: SuppliersService) {}

  // ----------------- Current Supplier Profile -----------------

  @UseGuards(JwtAuthGuard)
  @Get('profile/me')
  async getMyProfile(@CurrentUser('id') userId: string) {
    return this.suppliersService.getProfileByUserId(userId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('profile/me')
  async createOrUpdateProfile(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateSupplierProfileDto,
  ) {
    return this.suppliersService.createOrUpdateProfile(userId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('profile/me')
  async updateProfile(
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateSupplierProfileDto,
  ) {
    return this.suppliersService.updateProfile(userId, dto);
  }

  // ----------------- Supplier Delivery Coverage -----------------

  @UseGuards(JwtAuthGuard)
  @Post('delivery-areas/me')
  async configureDeliveryAreas(
    @CurrentUser('id') userId: string,
    @Body() dto: ConfigureDeliveryAreasDto,
  ) {
    return this.suppliersService.configureDeliveryAreas(userId, dto.areas);
  }

  @UseGuards(JwtAuthGuard)
  @Get('delivery-areas/me')
  async getMyDeliveryAreas(@CurrentUser('id') userId: string) {
    const profile = await this.suppliersService.getProfileByUserId(userId);
    return profile.deliveryAreas;
  }

  // ----------------- Supplier Fuel Listings -----------------

  @UseGuards(JwtAuthGuard)
  @Get('fuel-listings/me')
  async getMyFuelListings(@CurrentUser('id') userId: string) {
    return this.suppliersService.getMyFuelListings(userId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('fuel-listings/me')
  async upsertFuelListing(
    @CurrentUser('id') userId: string,
    @Body() dto: UpsertFuelListingDto,
  ) {
    return this.suppliersService.upsertFuelListing(userId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('fuel-listings/me/:fuelTypeId')
  async updateFuelListing(
    @CurrentUser('id') userId: string,
    @Param('fuelTypeId') fuelTypeId: string,
    @Body() dto: UpdateFuelListingDto,
  ) {
    return this.suppliersService.updateFuelListing(userId, fuelTypeId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('fuel-listings/me/:fuelTypeId')
  async removeFuelListing(
    @CurrentUser('id') userId: string,
    @Param('fuelTypeId') fuelTypeId: string,
  ) {
    await this.suppliersService.removeFuelListing(userId, fuelTypeId);
    return { removed: true };
  }

  // ----------------- Admin Management -----------------

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Get('admin/all')
  async listAllForAdmin(@Query('status') status?: VerificationStatus) {
    return this.suppliersService.listAllSuppliersForAdmin(status);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Get('admin/fuel-listings')
  async listFuelListingsForAdmin(@Query('suspended') suspended?: string) {
    return this.suppliersService.listFuelListingsForAdmin(suspended === 'true');
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Patch('admin/fuel-listings/:listingId/suspension')
  async setFuelListingSuspension(
    @Param('listingId') listingId: string,
    @Body() dto: SuspendFuelListingDto,
  ) {
    return this.suppliersService.setFuelListingSuspension(
      listingId,
      dto.isSuspended,
      dto.reason,
    );
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Patch(':id/verify')
  async verifySupplier(
    @Param('id') id: string,
    @Body() dto: VerifySupplierDto,
  ) {
    return this.suppliersService.verifySupplier(
      id,
      dto.status,
      dto.rejectionReason,
    );
  }

  // ----------------- Public Marketplace -----------------

  @Public()
  @Get()
  async listPublic(
    @Query('city') city?: string,
    @Query('deliveryAreaId') deliveryAreaId?: string,
    @Query('fuelTypeId') fuelTypeId?: string,
  ) {
    return this.suppliersService.listPublicSuppliers(
      city,
      deliveryAreaId,
      fuelTypeId,
    );
  }

  @Public()
  @Get(':id')
  async getPublicById(@Param('id') id: string) {
    return this.suppliersService.getPublicSupplierById(id);
  }
}
