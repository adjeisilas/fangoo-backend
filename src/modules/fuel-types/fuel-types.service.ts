import {
  Injectable,
  ConflictException,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { CreateFuelTypeDto } from './dto/create-fuel-type.dto.js';
import { UpdateFuelTypeDto } from './dto/update-fuel-type.dto.js';

@Injectable()
export class FuelTypesService implements OnModuleInit {
  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    await this.seedDefaultFuelTypes();
  }

  async findAll() {
    return this.prisma.fuelType.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });
  }

  /** Admin view includes deactivated types, which never appear in the public catalogue. */
  async findAllForAdmin() {
    return this.prisma.fuelType.findMany({
      include: { _count: { select: { supplierFuels: true } } },
      orderBy: { name: 'asc' },
    });
  }

  async update(id: string, dto: UpdateFuelTypeDto) {
    const fuelType = await this.prisma.fuelType.findUnique({ where: { id } });

    if (!fuelType) {
      throw new NotFoundException('Fuel type not found');
    }

    if (dto.name) {
      const clash = await this.prisma.fuelType.findUnique({
        where: { name: dto.name.trim() },
      });

      if (clash && clash.id !== id) {
        throw new ConflictException(`Fuel type '${dto.name}' already exists`);
      }
    }

    const data: Record<string, any> = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.isActive !== undefined) data.isActive = dto.isActive;

    return this.prisma.fuelType.update({ where: { id }, data });
  }

  async create(dto: CreateFuelTypeDto) {
    const existing = await this.prisma.fuelType.findUnique({
      where: { name: dto.name.trim() },
    });

    if (existing) {
      throw new ConflictException(`Fuel type '${dto.name}' already exists`);
    }

    return this.prisma.fuelType.create({
      data: {
        name: dto.name.trim(),
      },
    });
  }

  async seedDefaultFuelTypes() {
    try {
      const count = await this.prisma.fuelType.count();
      if (count > 0) return;

      const defaults = [
        'Petrol (PMS)',
        'Diesel (AGO)',
        'Kerosene (DPK)',
        'Cooking Gas (LPG)',
      ];

      for (const name of defaults) {
        await this.prisma.fuelType.create({ data: { name } });
      }
    } catch {
      // Ignore seeding errors in environments where DB is temporarily unavailable
    }
  }
}
