import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { Role, VerificationStatus } from '../../generated/prisma/client.js';
import { CreateSupplierProfileDto } from './dto/create-supplier-profile.dto.js';
import { UpdateSupplierProfileDto } from './dto/update-supplier-profile.dto.js';
import { DeliveryAreaAssignmentDto } from './dto/configure-delivery-areas.dto.js';
import { UpsertFuelListingDto } from './dto/upsert-fuel-listing.dto.js';
import { UpdateFuelListingDto } from './dto/update-fuel-listing.dto.js';

@Injectable()
export class SuppliersService {
  constructor(private readonly prisma: PrismaService) {}

  async createOrUpdateProfile(userId: string, dto: CreateSupplierProfileDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Auto-promote customer to supplier role when creating a supplier profile
    if (user.role === Role.CUSTOMER) {
      await this.prisma.user.update({
        where: { id: userId },
        data: { role: Role.SUPPLIER },
      });
    }

    const profileData = {
      companyName: dto.companyName.trim(),
      businessRegNumber: dto.businessRegNumber?.trim() || null,
      taxId: dto.taxId?.trim() || null,
      description: dto.description?.trim() || null,
      address: dto.address.trim(),
      city: dto.city.trim(),
      postalCode: dto.postalCode?.trim() || null,
      contactPhone: dto.contactPhone.trim(),
      contactEmail: dto.contactEmail.toLowerCase().trim(),
    };

    return this.prisma.supplierProfile.upsert({
      where: { userId },
      create: {
        userId,
        ...profileData,
        verificationStatus: VerificationStatus.PENDING,
      },
      update: profileData,
      include: {
        deliveryAreas: {
          include: {
            deliveryArea: true,
          },
        },
      },
    });
  }

  async updateProfile(userId: string, dto: UpdateSupplierProfileDto) {
    const profile = await this.prisma.supplierProfile.findUnique({
      where: { userId },
    });

    if (!profile) {
      throw new NotFoundException('Supplier profile not found');
    }

    const dataToUpdate: Record<string, any> = {};
    if (dto.companyName !== undefined)
      dataToUpdate.companyName = dto.companyName.trim();
    if (dto.businessRegNumber !== undefined)
      dataToUpdate.businessRegNumber = dto.businessRegNumber.trim();
    if (dto.taxId !== undefined) dataToUpdate.taxId = dto.taxId.trim();
    if (dto.description !== undefined)
      dataToUpdate.description = dto.description.trim();
    if (dto.address !== undefined) dataToUpdate.address = dto.address.trim();
    if (dto.city !== undefined) dataToUpdate.city = dto.city.trim();
    if (dto.postalCode !== undefined)
      dataToUpdate.postalCode = dto.postalCode.trim();
    if (dto.contactPhone !== undefined)
      dataToUpdate.contactPhone = dto.contactPhone.trim();
    if (dto.contactEmail !== undefined)
      dataToUpdate.contactEmail = dto.contactEmail.toLowerCase().trim();
    if (dto.isAcceptingOrders !== undefined)
      dataToUpdate.isAcceptingOrders = dto.isAcceptingOrders;

    return this.prisma.supplierProfile.update({
      where: { userId },
      data: dataToUpdate,
      include: {
        deliveryAreas: {
          include: {
            deliveryArea: true,
          },
        },
      },
    });
  }

  async getProfileByUserId(userId: string) {
    const profile = await this.prisma.supplierProfile.findUnique({
      where: { userId },
      include: {
        deliveryAreas: {
          include: {
            deliveryArea: true,
          },
        },
      },
    });

    if (!profile) {
      throw new NotFoundException('Supplier profile has not been created yet');
    }

    return profile;
  }

  async configureDeliveryAreas(
    userId: string,
    areas: DeliveryAreaAssignmentDto[],
  ) {
    const profile = await this.prisma.supplierProfile.findUnique({
      where: { userId },
    });

    if (!profile) {
      throw new NotFoundException('Supplier profile not found');
    }

    // Verify all specified delivery area IDs exist
    const areaIds = areas.map((a) => a.deliveryAreaId);
    if (areaIds.length > 0) {
      const existingCount = await this.prisma.deliveryArea.count({
        where: { id: { in: areaIds } },
      });
      if (existingCount !== areaIds.length) {
        throw new NotFoundException(
          'One or more delivery area IDs are invalid',
        );
      }
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.supplierDeliveryArea.deleteMany({
        where: { supplierProfileId: profile.id },
      });

      if (areas.length > 0) {
        await tx.supplierDeliveryArea.createMany({
          data: areas.map((a) => ({
            supplierProfileId: profile.id,
            deliveryAreaId: a.deliveryAreaId,
            deliveryFee: a.deliveryFee ?? 0,
            estimatedDeliveryHours: a.estimatedDeliveryHours ?? null,
          })),
        });
      }

      return tx.supplierProfile.findUnique({
        where: { id: profile.id },
        include: {
          deliveryAreas: {
            include: {
              deliveryArea: true,
            },
          },
        },
      });
    });
  }

  // ----------------- Supplier Fuel Listings -----------------

  async getMyFuelListings(userId: string) {
    const profile = await this.prisma.supplierProfile.findUnique({
      where: { userId },
    });

    if (!profile) {
      throw new NotFoundException('Supplier profile not found');
    }

    return this.prisma.supplierFuel.findMany({
      where: { supplierProfileId: profile.id },
      include: { fuelType: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  async upsertFuelListing(userId: string, dto: UpsertFuelListingDto) {
    const profile = await this.prisma.supplierProfile.findUnique({
      where: { userId },
    });

    if (!profile) {
      throw new NotFoundException('Supplier profile not found');
    }

    const fuelType = await this.prisma.fuelType.findUnique({
      where: { id: dto.fuelTypeId },
    });

    if (!fuelType) {
      throw new NotFoundException('Fuel type not found');
    }

    return this.prisma.supplierFuel.upsert({
      where: {
        supplierProfileId_fuelTypeId: {
          supplierProfileId: profile.id,
          fuelTypeId: dto.fuelTypeId,
        },
      },
      create: {
        supplierProfileId: profile.id,
        fuelTypeId: dto.fuelTypeId,
        pricePerLitre: dto.pricePerLitre,
        availableQuantity: dto.availableQuantity,
        minimumOrderLitres: dto.minimumOrderLitres ?? 1,
        isAvailable: dto.isAvailable ?? true,
      },
      update: {
        pricePerLitre: dto.pricePerLitre,
        availableQuantity: dto.availableQuantity,
        minimumOrderLitres: dto.minimumOrderLitres ?? 1,
        isAvailable: dto.isAvailable ?? true,
      },
      include: { fuelType: true },
    });
  }

  async updateFuelListing(
    userId: string,
    fuelTypeId: string,
    dto: UpdateFuelListingDto,
  ) {
    const profile = await this.prisma.supplierProfile.findUnique({
      where: { userId },
    });

    if (!profile) {
      throw new NotFoundException('Supplier profile not found');
    }

    const listing = await this.prisma.supplierFuel.findUnique({
      where: {
        supplierProfileId_fuelTypeId: {
          supplierProfileId: profile.id,
          fuelTypeId,
        },
      },
    });

    if (!listing) {
      throw new NotFoundException('Fuel listing not found');
    }

    const dataToUpdate: Record<string, any> = {};
    if (dto.pricePerLitre !== undefined)
      dataToUpdate.pricePerLitre = dto.pricePerLitre;
    if (dto.availableQuantity !== undefined)
      dataToUpdate.availableQuantity = dto.availableQuantity;
    if (dto.minimumOrderLitres !== undefined)
      dataToUpdate.minimumOrderLitres = dto.minimumOrderLitres;
    if (dto.isAvailable !== undefined)
      dataToUpdate.isAvailable = dto.isAvailable;

    return this.prisma.supplierFuel.update({
      where: { id: listing.id },
      data: dataToUpdate,
      include: { fuelType: true },
    });
  }

  async removeFuelListing(userId: string, fuelTypeId: string) {
    const profile = await this.prisma.supplierProfile.findUnique({
      where: { userId },
    });

    if (!profile) {
      throw new NotFoundException('Supplier profile not found');
    }

    const listing = await this.prisma.supplierFuel.findUnique({
      where: {
        supplierProfileId_fuelTypeId: {
          supplierProfileId: profile.id,
          fuelTypeId,
        },
      },
    });

    if (!listing) {
      throw new NotFoundException('Fuel listing not found');
    }

    await this.prisma.supplierFuel.delete({ where: { id: listing.id } });
  }

  async listPublicSuppliers(
    city?: string,
    deliveryAreaId?: string,
    fuelTypeId?: string,
  ) {
    const where: any = {
      verificationStatus: VerificationStatus.VERIFIED,
      isAcceptingOrders: true,
    };

    if (city) {
      where.city = { contains: city, mode: 'insensitive' };
    }

    if (deliveryAreaId) {
      where.deliveryAreas = {
        some: { deliveryAreaId },
      };
    }

    if (fuelTypeId) {
      where.fuelListings = {
        some: { fuelTypeId, isAvailable: true, isSuspended: false },
      };
    }

    const suppliers = await this.prisma.supplierProfile.findMany({
      where,
      select: {
        id: true,
        companyName: true,
        description: true,
        city: true,
        address: true,
        contactPhone: true,
        contactEmail: true,
        isAcceptingOrders: true,
        verificationStatus: true,
        deliveryAreas: {
          select: {
            deliveryFee: true,
            estimatedDeliveryHours: true,
            deliveryArea: {
              select: {
                id: true,
                name: true,
                city: true,
                region: true,
              },
            },
          },
        },
        fuelListings: {
          // Scoped to the queried fuel type when filtering, so the price shown is the comparable one
          where: {
            isAvailable: true,
            isSuspended: false,
            fuelType: { isActive: true },
            ...(fuelTypeId ? { fuelTypeId } : {}),
          },
          select: {
            pricePerLitre: true,
            availableQuantity: true,
            minimumOrderLitres: true,
            fuelType: {
              select: { id: true, name: true },
            },
          },
        },
      },
    });

    if (fuelTypeId) {
      // Price is only comparable across suppliers within a single fuel type — cheapest first
      suppliers.sort((a, b) => {
        const priceA = Number(a.fuelListings[0]?.pricePerLitre ?? Infinity);
        const priceB = Number(b.fuelListings[0]?.pricePerLitre ?? Infinity);
        return priceA - priceB;
      });
    }

    return suppliers;
  }

  async getPublicSupplierById(id: string) {
    const supplier = await this.prisma.supplierProfile.findFirst({
      where: {
        id,
        verificationStatus: VerificationStatus.VERIFIED,
      },
      select: {
        id: true,
        companyName: true,
        description: true,
        city: true,
        address: true,
        contactPhone: true,
        contactEmail: true,
        isAcceptingOrders: true,
        verificationStatus: true,
        deliveryAreas: {
          select: {
            deliveryFee: true,
            estimatedDeliveryHours: true,
            deliveryArea: {
              select: {
                id: true,
                name: true,
                city: true,
                region: true,
              },
            },
          },
        },
        fuelListings: {
          where: {
            isAvailable: true,
            isSuspended: false,
            fuelType: { isActive: true },
          },
          select: {
            pricePerLitre: true,
            availableQuantity: true,
            minimumOrderLitres: true,
            fuelType: {
              select: { id: true, name: true },
            },
          },
        },
      },
    });

    if (!supplier) {
      throw new NotFoundException('Verified supplier not found');
    }

    return supplier;
  }

  async verifySupplier(
    id: string,
    status: VerificationStatus,
    rejectionReason?: string,
  ) {
    const profile = await this.prisma.supplierProfile.findUnique({
      where: { id },
    });

    if (!profile) {
      throw new NotFoundException('Supplier profile not found');
    }

    return this.prisma.supplierProfile.update({
      where: { id },
      data: {
        verificationStatus: status,
        verifiedAt: status === VerificationStatus.VERIFIED ? new Date() : null,
        rejectionReason:
          status === VerificationStatus.REJECTED
            ? rejectionReason?.trim() || 'Verification rejected'
            : null,
      },
    });
  }

  async listFuelListingsForAdmin(suspendedOnly?: boolean) {
    return this.prisma.supplierFuel.findMany({
      where: suspendedOnly ? { isSuspended: true } : {},
      include: {
        fuelType: true,
        supplier: { select: { id: true, companyName: true, city: true } },
      },
      orderBy: { updatedAt: 'desc' },
      take: 200,
    });
  }

  async setFuelListingSuspension(
    listingId: string,
    isSuspended: boolean,
    reason?: string,
  ) {
    const listing = await this.prisma.supplierFuel.findUnique({
      where: { id: listingId },
    });

    if (!listing) {
      throw new NotFoundException('Fuel listing not found');
    }

    return this.prisma.supplierFuel.update({
      where: { id: listingId },
      data: {
        isSuspended,
        suspensionReason: isSuspended ? reason?.trim() || null : null,
      },
      include: {
        fuelType: true,
        supplier: { select: { id: true, companyName: true } },
      },
    });
  }

  async listAllSuppliersForAdmin(status?: VerificationStatus) {
    const where: any = {};
    if (status) {
      where.verificationStatus = status;
    }

    return this.prisma.supplierProfile.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            phone: true,
            isActive: true,
          },
        },
        deliveryAreas: {
          include: {
            deliveryArea: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}
