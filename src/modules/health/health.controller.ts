import {
  Controller,
  Get,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';

@Controller('health')
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * An API that cannot reach its database serves nothing but errors, so this
   * fails with 503 rather than reporting "ok" with a note. Container runtimes and
   * load balancers act on the status code alone: answering 200 kept a broken
   * instance in rotation.
   */
  @Get()
  async check(): Promise<{ status: string; timestamp: string; database: string }> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch (error) {
      this.logger.error(
        'Health check failed: the database did not answer',
        error instanceof Error ? error.stack : String(error),
      );
      throw new ServiceUnavailableException('Database unavailable');
    }

    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      database: 'connected',
    };
  }
}
