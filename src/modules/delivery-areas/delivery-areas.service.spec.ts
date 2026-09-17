import { readFileSync } from 'node:fs';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { DeliveryAreasService } from './delivery-areas.service.js';
import { REGION_IDS } from './regions.js';

describe('DeliveryAreasService', () => {
  let service: DeliveryAreasService;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      deliveryArea: {
        findMany: vi.fn().mockResolvedValue([]),
        findUnique: vi.fn(),
        count: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      region: {
        findMany: vi.fn().mockResolvedValue([]),
        findUnique: vi.fn(),
      },
    };

    service = new DeliveryAreasService(mockPrisma);
  });

  describe('findAll', () => {
    it('returns active areas with their region, grouped by region name', async () => {
      await service.findAll();

      expect(mockPrisma.deliveryArea.findMany).toHaveBeenCalledWith({
        where: { isActive: true },
        omit: { legacyRegion: true },
        include: { region: { select: { id: true, name: true, capital: true } } },
        orderBy: [{ region: { name: 'asc' } }, { name: 'asc' }],
      });
    });

    /** The free-text column survives only until a later migration drops it. */
    it('never exposes the legacy region text', async () => {
      await service.findAll();

      const args = mockPrisma.deliveryArea.findMany.mock.calls[0][0];
      expect(args.omit).toEqual({ legacyRegion: true });
    });
  });

  describe('findAllForAdmin', () => {
    it('includes inactive areas, their region and how much each is used', async () => {
      await service.findAllForAdmin();

      expect(mockPrisma.deliveryArea.findMany).toHaveBeenCalledWith({
        omit: { legacyRegion: true },
        include: {
          region: { select: { id: true, name: true, capital: true } },
          _count: { select: { suppliers: true, orders: true, requests: true } },
        },
        orderBy: [{ region: { name: 'asc' } }, { name: 'asc' }],
      });
      expect(mockPrisma.deliveryArea.findMany.mock.calls[0][0]).not.toHaveProperty('where');
    });
  });

  describe('update', () => {
    const area = { id: 'area-1', name: 'Accra Metropolitan Area' };

    beforeEach(() => {
      mockPrisma.deliveryArea.findUnique.mockImplementation(({ where }: any) =>
        Promise.resolve(where.id === 'area-1' || where.name === area.name ? area : null),
      );
      mockPrisma.region.findUnique.mockResolvedValue({ id: REGION_IDS.ASHANTI });
    });

    it('updates the fields sent, trimmed, and returns the area with its region', async () => {
      await service.update('area-1', {
        name: ' Accra Municipal ',
        city: ' Accra ',
        regionId: REGION_IDS.ASHANTI,
      });

      expect(mockPrisma.deliveryArea.update).toHaveBeenCalledWith({
        where: { id: 'area-1' },
        data: { name: 'Accra Municipal', city: 'Accra', regionId: REGION_IDS.ASHANTI },
        omit: { legacyRegion: true },
        include: { region: { select: { id: true, name: true, capital: true } } },
      });
    });

    it('can change only the active status', async () => {
      await service.update('area-1', { isActive: false });

      expect(mockPrisma.deliveryArea.update.mock.calls[0][0].data).toEqual({ isActive: false });
      expect(mockPrisma.region.findUnique).not.toHaveBeenCalled();
    });

    it('keeps its own name without calling it a clash', async () => {
      await expect(
        service.update('area-1', { name: 'Accra Metropolitan Area' }),
      ).resolves.toBeUndefined();
      expect(mockPrisma.deliveryArea.update).toHaveBeenCalled();
    });

    it('rejects a name another area already uses', async () => {
      mockPrisma.deliveryArea.findUnique.mockImplementation(({ where }: any) =>
        Promise.resolve(where.id ? area : { id: 'area-2', name: 'Tema Metropolitan Area' }),
      );

      await expect(
        service.update('area-1', { name: 'Tema Metropolitan Area' }),
      ).rejects.toThrow(new ConflictException("Delivery area 'Tema Metropolitan Area' already exists"));
      expect(mockPrisma.deliveryArea.update).not.toHaveBeenCalled();
    });

    it('rejects an unknown area', async () => {
      await expect(service.update('missing', { isActive: true })).rejects.toThrow(
        new NotFoundException('Delivery area not found'),
      );
      expect(mockPrisma.deliveryArea.update).not.toHaveBeenCalled();
    });

    it('rejects an unknown region', async () => {
      mockPrisma.region.findUnique.mockResolvedValue(null);

      await expect(service.update('area-1', { regionId: 'nope' })).rejects.toThrow(
        new NotFoundException('Region not found'),
      );
      expect(mockPrisma.deliveryArea.update).not.toHaveBeenCalled();
    });
  });

  describe('findAllRegions', () => {
    it('lists every region by name', async () => {
      await service.findAllRegions();

      expect(mockPrisma.region.findMany).toHaveBeenCalledWith({
        select: { id: true, name: true, capital: true },
        orderBy: { name: 'asc' },
      });
    });
  });

  describe('create', () => {
    const dto = {
      name: '  Tamale Metropolitan Area ',
      city: ' Tamale ',
      regionId: REGION_IDS.NORTHERN,
    };

    it('creates the area under its region', async () => {
      mockPrisma.deliveryArea.findUnique.mockResolvedValue(null);
      mockPrisma.region.findUnique.mockResolvedValue({ id: REGION_IDS.NORTHERN });

      await service.create(dto);

      expect(mockPrisma.deliveryArea.create).toHaveBeenCalledWith({
        data: {
          name: 'Tamale Metropolitan Area',
          city: 'Tamale',
          regionId: REGION_IDS.NORTHERN,
        },
        omit: { legacyRegion: true },
        include: { region: { select: { id: true, name: true, capital: true } } },
      });
    });

    it('rejects a duplicate name', async () => {
      mockPrisma.deliveryArea.findUnique.mockResolvedValue({ id: 'existing' });

      await expect(service.create(dto)).rejects.toThrow(ConflictException);
      expect(mockPrisma.deliveryArea.create).not.toHaveBeenCalled();
    });

    it('rejects an unknown region without creating anything', async () => {
      mockPrisma.deliveryArea.findUnique.mockResolvedValue(null);
      mockPrisma.region.findUnique.mockResolvedValue(null);

      await expect(service.create(dto)).rejects.toThrow(
        new NotFoundException('Region not found'),
      );
      expect(mockPrisma.deliveryArea.create).not.toHaveBeenCalled();
    });
  });

  describe('seedDefaultAreas', () => {
    it('does nothing when areas already exist', async () => {
      mockPrisma.deliveryArea.count.mockResolvedValue(4);

      await service.seedDefaultAreas();

      expect(mockPrisma.deliveryArea.create).not.toHaveBeenCalled();
    });

    it('creates the four default areas under their regions', async () => {
      mockPrisma.deliveryArea.count.mockResolvedValue(0);

      await service.seedDefaultAreas();

      expect(mockPrisma.deliveryArea.create.mock.calls.map((call: any[]) => call[0].data)).toEqual([
        { name: 'Accra Metropolitan Area', city: 'Accra', regionId: REGION_IDS.GREATER_ACCRA },
        { name: 'Tema Metropolitan Area', city: 'Tema', regionId: REGION_IDS.GREATER_ACCRA },
        { name: 'Kumasi Metropolitan Area', city: 'Kumasi', regionId: REGION_IDS.ASHANTI },
        { name: 'Sekondi-Takoradi Metropolitan Area', city: 'Takoradi', regionId: REGION_IDS.WESTERN },
      ]);
    });

    it('still swallows database errors at boot', async () => {
      mockPrisma.deliveryArea.count.mockRejectedValue(new Error('database down'));

      await expect(service.seedDefaultAreas()).resolves.toBeUndefined();
    });
  });
});

/**
 * The migration inserts the regions; `REGION_IDS` only names them. If the two
 * ever disagree, the seeder would point areas at regions that do not exist.
 */
describe('REGION_IDS and the add_regions migration', () => {
  const sql = readFileSync(
    new URL('../../../prisma/migrations/20260916125602_add_regions/migration.sql', import.meta.url),
    'utf8',
  );
  const inserted = [...sql.matchAll(/\('([0-9a-f-]{36})',\s*'([^']+)',\s*'([^']+)',\s*CURRENT_TIMESTAMP\)/g)]
    .map((match) => ({ id: match[1], name: match[2], capital: match[3] }));

  it('the migration inserts exactly 16 regions with distinct ids and names', () => {
    expect(inserted).toHaveLength(16);
    expect(new Set(inserted.map((r) => r.id)).size).toBe(16);
    expect(new Set(inserted.map((r) => r.name)).size).toBe(16);
  });

  it('every id in code is one the migration inserts, and vice versa', () => {
    expect(new Set(Object.values(REGION_IDS))).toEqual(new Set(inserted.map((r) => r.id)));
  });

  it.each([
    ['GREATER_ACCRA', 'Greater Accra Region'],
    ['ASHANTI', 'Ashanti Region'],
    ['WESTERN', 'Western Region'],
    ['WESTERN_NORTH', 'Western North Region'],
    ['NORTHERN', 'Northern Region'],
  ] as const)('%s names %s', (key, name) => {
    expect(inserted.find((r) => r.id === REGION_IDS[key])?.name).toBe(name);
  });
});
