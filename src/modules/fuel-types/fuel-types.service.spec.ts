import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConflictException } from '@nestjs/common';
import { FuelTypesService } from './fuel-types.service.js';

describe('FuelTypesService', () => {
  let service: FuelTypesService;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      fuelType: {
        findMany: vi.fn(),
        findUnique: vi.fn(),
        create: vi.fn(),
        count: vi.fn(),
      },
    };

    service = new FuelTypesService(mockPrisma as any);
  });

  describe('findAll', () => {
    it('should return only active fuel types', async () => {
      mockPrisma.fuelType.findMany.mockResolvedValue([
        { id: 'fuel-1', name: 'Petrol (PMS)', isActive: true },
      ]);

      const result = await service.findAll();

      expect(result).toHaveLength(1);
      expect(mockPrisma.fuelType.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { isActive: true } }),
      );
    });
  });

  describe('create', () => {
    it('should create a fuel type when the name is unique', async () => {
      mockPrisma.fuelType.findUnique.mockResolvedValue(null);
      mockPrisma.fuelType.create.mockResolvedValue({
        id: 'fuel-1',
        name: 'Diesel (AGO)',
      });

      const result = await service.create({ name: 'Diesel (AGO)' });

      expect(result.name).toBe('Diesel (AGO)');
      expect(mockPrisma.fuelType.create).toHaveBeenCalledWith({
        data: { name: 'Diesel (AGO)' },
      });
    });

    it('should throw ConflictException when the name already exists', async () => {
      mockPrisma.fuelType.findUnique.mockResolvedValue({
        id: 'fuel-1',
        name: 'Diesel (AGO)',
      });

      await expect(service.create({ name: 'Diesel (AGO)' })).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('seedDefaultFuelTypes', () => {
    it('should skip seeding when fuel types already exist', async () => {
      mockPrisma.fuelType.count.mockResolvedValue(4);

      await service.seedDefaultFuelTypes();

      expect(mockPrisma.fuelType.create).not.toHaveBeenCalled();
    });

    it('should seed default fuel types when none exist', async () => {
      mockPrisma.fuelType.count.mockResolvedValue(0);

      await service.seedDefaultFuelTypes();

      expect(mockPrisma.fuelType.create).toHaveBeenCalledTimes(4);
    });
  });
});
