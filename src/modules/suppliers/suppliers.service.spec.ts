import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { SuppliersService } from './suppliers.service.js';
import { Role, VerificationStatus } from '../../generated/prisma/client.js';

describe('SuppliersService', () => {
  let service: SuppliersService;
  let mockPrisma: any;

  const mockUser = {
    id: 'user-supplier-1',
    email: 'supplier@example.com',
    role: Role.CUSTOMER,
  };

  const mockProfile = {
    id: 'profile-1',
    userId: 'user-supplier-1',
    companyName: 'Energy Express Ltd',
    businessRegNumber: 'BN123456',
    address: '10 Industrial Way',
    city: 'Accra',
    contactPhone: '+233200000000',
    contactEmail: 'contact@energyexpress.com',
    verificationStatus: VerificationStatus.PENDING,
    isAcceptingOrders: true,
    deliveryAreas: [],
  };

  beforeEach(() => {
    mockPrisma = {
      user: {
        findUnique: vi.fn(),
        update: vi.fn(),
      },
      supplierProfile: {
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        upsert: vi.fn(),
      },
      deliveryArea: {
        findMany: vi.fn(),
      },
      supplierDeliveryArea: {
        deleteMany: vi.fn(),
        createMany: vi.fn(),
      },
      fuelType: {
        findUnique: vi.fn(),
      },
      supplierFuel: {
        findMany: vi.fn(),
        findUnique: vi.fn(),
        upsert: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
      $transaction: vi.fn((cb) => cb(mockPrisma)),
    };

    service = new SuppliersService(mockPrisma as any);
  });

  describe('createOrUpdateProfile', () => {
    it('should create supplier profile and promote customer to supplier', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.supplierProfile.upsert.mockResolvedValue(mockProfile);

      const result = await service.createOrUpdateProfile('user-supplier-1', {
        companyName: 'Energy Express Ltd',
        address: '10 Industrial Way',
        city: 'Accra',
        contactPhone: '+233200000000',
        contactEmail: 'contact@energyexpress.com',
      });

      expect(result.companyName).toBe('Energy Express Ltd');
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-supplier-1' },
        data: { role: Role.SUPPLIER },
      });
      expect(mockPrisma.supplierProfile.upsert).toHaveBeenCalled();
    });

    it('should throw NotFoundException if user does not exist', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.createOrUpdateProfile('nonexistent-id', {
          companyName: 'Test',
          address: 'Test',
          city: 'Test',
          contactPhone: '123',
          contactEmail: 'test@example.com',
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  /**
   * Regression: a verified depot could rename itself, or swap its registration
   * number or tax ID, and keep the badge an admin gave a different business.
   */
  describe('re-verification after identity changes', () => {
    const verified = {
      ...mockProfile,
      taxId: 'TIN-1',
      verificationStatus: VerificationStatus.VERIFIED,
    };
    const backToReview = {
      verificationStatus: VerificationStatus.PENDING,
      verifiedAt: null,
    };
    const updateData = () => mockPrisma.supplierProfile.update.mock.calls[0][0].data;

    beforeEach(() => {
      mockPrisma.supplierProfile.findUnique.mockResolvedValue(verified);
    });

    it.each([
      ['company name', { companyName: 'Other Fuels Ltd' }],
      ['registration number', { businessRegNumber: 'BN999' }],
      ['tax ID', { taxId: 'TIN-2' }],
    ])('sends a verified depot back to review when its %s changes', async (_field, dto) => {
      await service.updateProfile('user-supplier-1', dto);

      expect(updateData()).toMatchObject(backToReview);
    });

    it('keeps the badge for changes an admin did not verify', async () => {
      await service.updateProfile('user-supplier-1', {
        description: 'Now open on Sundays',
        contactPhone: '+233201111111',
        isAcceptingOrders: false,
      });

      expect(updateData()).not.toHaveProperty('verificationStatus');
    });

    it('keeps the badge when the same details are saved again', async () => {
      await service.updateProfile('user-supplier-1', {
        companyName: '  Energy Express Ltd ',
        businessRegNumber: 'BN123456',
        taxId: 'TIN-1',
      });

      expect(updateData()).not.toHaveProperty('verificationStatus');
    });

    it('leaves a depot that is not verified in its current state', async () => {
      mockPrisma.supplierProfile.findUnique.mockResolvedValue(mockProfile);

      await service.updateProfile('user-supplier-1', { companyName: 'Renamed Ltd' });

      expect(updateData()).not.toHaveProperty('verificationStatus');
    });

    it('applies the same rule when the full profile form is resubmitted', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ ...mockUser, role: Role.SUPPLIER });

      await service.createOrUpdateProfile('user-supplier-1', {
        companyName: 'Energy Express Ltd',
        businessRegNumber: 'BN123456',
        taxId: 'TIN-CHANGED',
        address: '10 Industrial Way',
        city: 'Accra',
        contactPhone: '+233200000000',
        contactEmail: 'contact@energyexpress.com',
      });

      const args = mockPrisma.supplierProfile.upsert.mock.calls[0][0];
      expect(args.update).toMatchObject(backToReview);
      expect(args.create.verificationStatus).toBe(VerificationStatus.PENDING);
    });

    it('creates a first profile as pending without touching anything else', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.supplierProfile.findUnique.mockResolvedValue(null);

      await service.createOrUpdateProfile('user-supplier-1', {
        companyName: 'Energy Express Ltd',
        address: '10 Industrial Way',
        city: 'Accra',
        contactPhone: '+233200000000',
        contactEmail: 'contact@energyexpress.com',
      });

      const args = mockPrisma.supplierProfile.upsert.mock.calls[0][0];
      expect(args.update).not.toHaveProperty('verificationStatus');
    });
  });

  describe('getProfileByUserId', () => {
    it('should return supplier profile with delivery areas', async () => {
      mockPrisma.supplierProfile.findUnique.mockResolvedValue(mockProfile);

      const profile = await service.getProfileByUserId('user-supplier-1');
      expect(profile.companyName).toBe('Energy Express Ltd');
    });

    it('should throw NotFoundException if profile does not exist', async () => {
      mockPrisma.supplierProfile.findUnique.mockResolvedValue(null);

      await expect(
        service.getProfileByUserId('user-supplier-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('verifySupplier', () => {
    it('should mark status as VERIFIED with timestamp', async () => {
      mockPrisma.supplierProfile.findUnique.mockResolvedValue(mockProfile);
      mockPrisma.supplierProfile.update.mockResolvedValue({
        ...mockProfile,
        verificationStatus: VerificationStatus.VERIFIED,
        verifiedAt: new Date(),
      });

      const updated = await service.verifySupplier(
        'profile-1',
        VerificationStatus.VERIFIED,
      );

      expect(updated.verificationStatus).toBe(VerificationStatus.VERIFIED);
      expect(mockPrisma.supplierProfile.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'profile-1' },
          data: expect.objectContaining({
            verificationStatus: VerificationStatus.VERIFIED,
            verifiedAt: expect.any(Date),
            rejectionReason: null,
          }),
        }),
      );
    });

    it('should mark status as REJECTED with reason', async () => {
      mockPrisma.supplierProfile.findUnique.mockResolvedValue(mockProfile);
      mockPrisma.supplierProfile.update.mockResolvedValue({
        ...mockProfile,
        verificationStatus: VerificationStatus.REJECTED,
        rejectionReason: 'Invalid documentation',
      });

      const updated = await service.verifySupplier(
        'profile-1',
        VerificationStatus.REJECTED,
        'Invalid documentation',
      );

      expect(updated.verificationStatus).toBe(VerificationStatus.REJECTED);
      expect(mockPrisma.supplierProfile.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'profile-1' },
          data: expect.objectContaining({
            verificationStatus: VerificationStatus.REJECTED,
            verifiedAt: null,
            rejectionReason: 'Invalid documentation',
          }),
        }),
      );
    });
  });

  describe('configureDeliveryAreas', () => {
    it('should assign delivery areas when valid IDs are provided', async () => {
      mockPrisma.supplierProfile.findUnique.mockResolvedValue(mockProfile);
      mockPrisma.deliveryArea.findMany.mockResolvedValue([
        { id: 'area-1', name: 'Area 1', isActive: true },
      ]);

      await service.configureDeliveryAreas('user-supplier-1', [
        {
          deliveryAreaId: 'area-1',
          deliveryFee: 25,
          estimatedDeliveryHours: 4,
        },
      ]);

      expect(mockPrisma.supplierDeliveryArea.deleteMany).toHaveBeenCalled();
      expect(mockPrisma.supplierDeliveryArea.createMany).toHaveBeenCalled();
    });

    /**
     * The coverage page only lists active areas, so replacing everything would
     * silently drop a supplier's coverage of a paused area on their next save.
     */
    it('should replace only coverage of active areas', async () => {
      mockPrisma.supplierProfile.findUnique.mockResolvedValue(mockProfile);
      mockPrisma.deliveryArea.findMany.mockResolvedValue([
        { id: 'area-1', name: 'Area 1', isActive: true },
      ]);

      await service.configureDeliveryAreas('user-supplier-1', [
        { deliveryAreaId: 'area-1' },
      ]);

      expect(mockPrisma.supplierDeliveryArea.deleteMany).toHaveBeenCalledWith({
        where: {
          supplierProfileId: 'profile-1',
          deliveryArea: { isActive: true },
        },
      });
    });

    it('should refuse to add a paused area without touching existing coverage', async () => {
      mockPrisma.supplierProfile.findUnique.mockResolvedValue(mockProfile);
      mockPrisma.deliveryArea.findMany.mockResolvedValue([
        { id: 'area-1', name: 'Paused Area', isActive: false },
      ]);

      await expect(
        service.configureDeliveryAreas('user-supplier-1', [
          { deliveryAreaId: 'area-1' },
        ]),
      ).rejects.toThrow(BadRequestException);

      expect(mockPrisma.supplierDeliveryArea.deleteMany).not.toHaveBeenCalled();
      expect(mockPrisma.supplierDeliveryArea.createMany).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException if any delivery area ID is invalid', async () => {
      mockPrisma.supplierProfile.findUnique.mockResolvedValue(mockProfile);
      mockPrisma.deliveryArea.findMany.mockResolvedValue([]);

      await expect(
        service.configureDeliveryAreas('user-supplier-1', [
          { deliveryAreaId: 'invalid-area-id' },
        ]),
      ).rejects.toThrow(NotFoundException);
    });

    /** Previously reported as "invalid IDs"; a repeat is now named as one. */
    it('should reject an area listed twice without touching existing coverage', async () => {
      mockPrisma.supplierProfile.findUnique.mockResolvedValue(mockProfile);
      mockPrisma.deliveryArea.findMany.mockResolvedValue([
        { id: 'area-1', name: 'Area 1', isActive: true },
      ]);

      await expect(
        service.configureDeliveryAreas('user-supplier-1', [
          { deliveryAreaId: 'area-1' },
          { deliveryAreaId: 'area-1', deliveryFee: 10 },
        ]),
      ).rejects.toThrow(BadRequestException);

      expect(mockPrisma.supplierDeliveryArea.deleteMany).not.toHaveBeenCalled();
      expect(mockPrisma.supplierDeliveryArea.createMany).not.toHaveBeenCalled();
    });
  });

  describe('public supplier pages', () => {
    const coverageSelect = (args: any) => args.select.deliveryAreas;

    it('list only coverage in active areas', async () => {
      mockPrisma.supplierProfile.findMany.mockResolvedValue([]);

      await service.listPublicSuppliers();

      expect(coverageSelect(mockPrisma.supplierProfile.findMany.mock.calls[0][0]).where).toEqual({
        deliveryArea: { isActive: true },
      });
    });

    it('never match a paused area when filtering by area', async () => {
      mockPrisma.supplierProfile.findMany.mockResolvedValue([]);

      await service.listPublicSuppliers(undefined, 'area-1');

      expect(mockPrisma.supplierProfile.findMany.mock.calls[0][0].where.deliveryAreas).toEqual({
        some: { deliveryAreaId: 'area-1', deliveryArea: { isActive: true } },
      });
    });

    /** Checkout offers exactly these areas, so a paused one must not be among them. */
    it('show a single supplier only with coverage in active areas', async () => {
      mockPrisma.supplierProfile.findFirst.mockResolvedValue({ id: 'profile-1' });

      await service.getPublicSupplierById('profile-1');

      expect(coverageSelect(mockPrisma.supplierProfile.findFirst.mock.calls[0][0]).where).toEqual({
        deliveryArea: { isActive: true },
      });
    });
  });

  describe('upsertFuelListing', () => {
    it('should create a fuel listing when the fuel type exists', async () => {
      mockPrisma.supplierProfile.findUnique.mockResolvedValue(mockProfile);
      mockPrisma.fuelType.findUnique.mockResolvedValue({
        id: 'fuel-1',
        name: 'Petrol (PMS)',
      });
      mockPrisma.supplierFuel.upsert.mockResolvedValue({
        id: 'listing-1',
        pricePerLitre: 15.5,
        availableQuantity: 5000,
      });

      const result = await service.upsertFuelListing('user-supplier-1', {
        fuelTypeId: 'fuel-1',
        pricePerLitre: 15.5,
        availableQuantity: 5000,
      });

      expect(result.pricePerLitre).toBe(15.5);
      expect(mockPrisma.supplierFuel.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            supplierProfileId_fuelTypeId: {
              supplierProfileId: 'profile-1',
              fuelTypeId: 'fuel-1',
            },
          },
        }),
      );
    });

    it('should throw NotFoundException when the fuel type does not exist', async () => {
      mockPrisma.supplierProfile.findUnique.mockResolvedValue(mockProfile);
      mockPrisma.fuelType.findUnique.mockResolvedValue(null);

      await expect(
        service.upsertFuelListing('user-supplier-1', {
          fuelTypeId: 'invalid-fuel-id',
          pricePerLitre: 15.5,
          availableQuantity: 5000,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when the supplier profile does not exist', async () => {
      mockPrisma.supplierProfile.findUnique.mockResolvedValue(null);

      await expect(
        service.upsertFuelListing('user-without-profile', {
          fuelTypeId: 'fuel-1',
          pricePerLitre: 15.5,
          availableQuantity: 5000,
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateFuelListing', () => {
    it('should update an existing fuel listing', async () => {
      mockPrisma.supplierProfile.findUnique.mockResolvedValue(mockProfile);
      mockPrisma.supplierFuel.findUnique.mockResolvedValue({
        id: 'listing-1',
        supplierProfileId: 'profile-1',
        fuelTypeId: 'fuel-1',
      });
      mockPrisma.supplierFuel.update.mockResolvedValue({
        id: 'listing-1',
        pricePerLitre: 16,
      });

      const result = await service.updateFuelListing(
        'user-supplier-1',
        'fuel-1',
        { pricePerLitre: 16 },
      );

      expect(result.pricePerLitre).toBe(16);
      expect(mockPrisma.supplierFuel.update).toHaveBeenCalledWith({
        where: { id: 'listing-1' },
        data: { pricePerLitre: 16 },
        include: { fuelType: true },
      });
    });

    it('should throw NotFoundException when the listing does not exist', async () => {
      mockPrisma.supplierProfile.findUnique.mockResolvedValue(mockProfile);
      mockPrisma.supplierFuel.findUnique.mockResolvedValue(null);

      await expect(
        service.updateFuelListing('user-supplier-1', 'fuel-1', {
          pricePerLitre: 16,
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('removeFuelListing', () => {
    it('should delete an existing fuel listing', async () => {
      mockPrisma.supplierProfile.findUnique.mockResolvedValue(mockProfile);
      mockPrisma.supplierFuel.findUnique.mockResolvedValue({
        id: 'listing-1',
        supplierProfileId: 'profile-1',
        fuelTypeId: 'fuel-1',
      });

      await service.removeFuelListing('user-supplier-1', 'fuel-1');

      expect(mockPrisma.supplierFuel.delete).toHaveBeenCalledWith({
        where: { id: 'listing-1' },
      });
    });

    it('should throw NotFoundException when the listing does not exist', async () => {
      mockPrisma.supplierProfile.findUnique.mockResolvedValue(mockProfile);
      mockPrisma.supplierFuel.findUnique.mockResolvedValue(null);

      await expect(
        service.removeFuelListing('user-supplier-1', 'fuel-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('listPublicSuppliers', () => {
    it('should filter by fuelTypeId and scope the returned fuelListings to it', async () => {
      mockPrisma.supplierProfile.findMany.mockResolvedValue([]);

      await service.listPublicSuppliers(undefined, undefined, 'fuel-1');

      expect(mockPrisma.supplierProfile.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            fuelListings: {
              some: {
                fuelTypeId: 'fuel-1',
                isAvailable: true,
                isSuspended: false,
              },
            },
          }),
          select: expect.objectContaining({
            fuelListings: expect.objectContaining({
              // Suspended listings and retired fuel types stay off the marketplace.
              where: {
                isAvailable: true,
                isSuspended: false,
                fuelType: { isActive: true },
                fuelTypeId: 'fuel-1',
              },
            }),
          }),
        }),
      );
    });

    it('should sort suppliers by cheapest price when fuelTypeId is provided', async () => {
      mockPrisma.supplierProfile.findMany.mockResolvedValue([
        {
          id: 'supplier-expensive',
          fuelListings: [{ pricePerLitre: '20.00' }],
        },
        { id: 'supplier-cheap', fuelListings: [{ pricePerLitre: '15.50' }] },
        { id: 'supplier-mid', fuelListings: [{ pricePerLitre: '18.00' }] },
      ]);

      const result = await service.listPublicSuppliers(
        undefined,
        undefined,
        'fuel-1',
      );

      expect(result.map((s: any) => s.id)).toEqual([
        'supplier-cheap',
        'supplier-mid',
        'supplier-expensive',
      ]);
    });

    it('should not sort when no fuelTypeId is provided', async () => {
      const unsorted = [
        { id: 'supplier-b', fuelListings: [] },
        { id: 'supplier-a', fuelListings: [] },
      ];
      mockPrisma.supplierProfile.findMany.mockResolvedValue(unsorted);

      const result = await service.listPublicSuppliers();

      expect(result.map((s: any) => s.id)).toEqual([
        'supplier-b',
        'supplier-a',
      ]);
    });
  });
});
