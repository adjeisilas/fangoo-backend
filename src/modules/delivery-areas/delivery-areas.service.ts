import {
  Injectable,
  ConflictException,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { CreateDeliveryAreaDto } from './dto/create-delivery-area.dto.js';
import { UpdateDeliveryAreaDto } from './dto/update-delivery-area.dto.js';
import {
  DELIVERY_AREA_WITH_REGION,
  REGION_SUMMARY_SELECT,
} from './delivery-area.query.js';
import { REGION_IDS } from './regions.js';

@Injectable()
export class DeliveryAreasService implements OnModuleInit {
  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    await this.seedDefaultAreas();
  }

  async findAll() {
    return this.prisma.deliveryArea.findMany({
      where: { isActive: true },
      ...DELIVERY_AREA_WITH_REGION,
      orderBy: [{ region: { name: 'asc' } }, { name: 'asc' }],
    });
  }

  /** Admin view: includes inactive areas, and how much each one is used. */
  async findAllForAdmin() {
    return this.prisma.deliveryArea.findMany({
      ...DELIVERY_AREA_WITH_REGION,
      include: {
        ...DELIVERY_AREA_WITH_REGION.include,
        _count: { select: { suppliers: true, orders: true, requests: true } },
      },
      orderBy: [{ region: { name: 'asc' } }, { name: 'asc' }],
    });
  }

  async update(id: string, dto: UpdateDeliveryAreaDto) {
    const area = await this.prisma.deliveryArea.findUnique({ where: { id } });

    if (!area) {
      throw new NotFoundException('Delivery area not found');
    }

    if (dto.name !== undefined) {
      const clash = await this.prisma.deliveryArea.findUnique({
        where: { name: dto.name.trim() },
      });

      if (clash && clash.id !== id) {
        throw new ConflictException(
          `Delivery area '${dto.name.trim()}' already exists`,
        );
      }
    }

    if (dto.regionId !== undefined) {
      const region = await this.prisma.region.findUnique({
        where: { id: dto.regionId },
      });

      if (!region) {
        throw new NotFoundException('Region not found');
      }
    }

    const data: Prisma.DeliveryAreaUncheckedUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.city !== undefined) data.city = dto.city.trim();
    if (dto.regionId !== undefined) data.regionId = dto.regionId;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;

    return this.prisma.deliveryArea.update({
      where: { id },
      data,
      ...DELIVERY_AREA_WITH_REGION,
    });
  }

  /** All 16 regions, including those without delivery areas yet. */
  async findAllRegions() {
    return this.prisma.region.findMany({
      select: REGION_SUMMARY_SELECT,
      orderBy: { name: 'asc' },
    });
  }

  async create(dto: CreateDeliveryAreaDto) {
    const existing = await this.prisma.deliveryArea.findUnique({
      where: { name: dto.name.trim() },
    });

    if (existing) {
      throw new ConflictException(
        `Delivery area '${dto.name}' already exists`,
      );
    }

    const region = await this.prisma.region.findUnique({
      where: { id: dto.regionId },
    });

    if (!region) {
      throw new NotFoundException('Region not found');
    }

    return this.prisma.deliveryArea.create({
      data: {
        name: dto.name.trim(),
        city: dto.city.trim(),
        regionId: region.id,
      },
      ...DELIVERY_AREA_WITH_REGION,
    });
  }

  /**
   * Gives an empty database its first delivery areas. The regions they belong to
   * are inserted by the `add_regions` migration, which always runs before boot.
   */
  async seedDefaultAreas() {
    try {
      const count = await this.prisma.deliveryArea.count();
      if (count > 0) return;

      const defaults = [
        {
          name: 'Accra Metropolitan Area',
          city: 'Accra',
          regionId: REGION_IDS.GREATER_ACCRA,
        },
        {
          name: 'Tema Metropolitan Area',
          city: 'Tema',
          regionId: REGION_IDS.GREATER_ACCRA,
        },
        {
          name: 'Kumasi Metropolitan Area',
          city: 'Kumasi',
          regionId: REGION_IDS.ASHANTI,
        },
        {
          name: 'Sekondi-Takoradi Metropolitan Area',
          city: 'Takoradi',
          regionId: REGION_IDS.WESTERN,
        },
      ];

      for (const area of defaults) {
        await this.prisma.deliveryArea.create({ data: area });
      }
    } catch {
      // Ignore seeding errors in environments where DB is temporarily unavailable
    }
  }
}
