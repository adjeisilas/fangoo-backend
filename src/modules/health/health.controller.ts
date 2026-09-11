import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async check(): Promise<{ status: string; timestamp: string; database: string }> {
    let database = 'disconnected';

    try {
      await this.prisma.$queryRawUnsafe('SELECT 1');
      database = 'connected';
    } catch {
      database = 'disconnected';
    }

    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      database,
    };
  }
}
