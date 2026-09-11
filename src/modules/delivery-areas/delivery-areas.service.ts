import {
  Injectable,
  ConflictException,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { CreateDeliveryAreaDto } from './dto/create-delivery-area.dto.js';

@Injectable()
export class DeliveryAreasService implements OnModuleInit {
  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    await this.seedDefaultAreas();
  }

  async findAll() {
    return this.prisma.deliveryArea.findMany({
      where: { isActive: true },
      orderBy: [{ region: 'asc' }, { name: 'asc' }],
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

    return this.prisma.deliveryArea.create({
      data: {
        name: dto.name.trim(),
        city: dto.city.trim(),
        region: dto.region.trim(),
      },
    });
  }

  async seedDefaultAreas() {
    try {
      const count = await this.prisma.deliveryArea.count();
      if (count > 0) return;

      const defaults = [
        {
          name: 'Accra Metropolitan Area',
          city: 'Accra',
          region: 'Greater Accra',
        },
        {
          name: 'Tema Metropolitan Area',
          city: 'Tema',
          region: 'Greater Accra',
        },
        {
          name: 'Kumasi Metropolitan Area',
          city: 'Kumasi',
          region: 'Ashanti Region',
        },
        {
          name: 'Sekondi-Takoradi Metropolitan Area',
          city: 'Takoradi',
          region: 'Western Region',
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
