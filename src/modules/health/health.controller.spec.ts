import { describe, it, expect, vi } from 'vitest';
import { HealthController } from './health.controller.js';
import { PrismaService } from '../../prisma/prisma.service.js';

describe('HealthController', () => {
  it('should report database as connected when query succeeds', async () => {
    const mockPrisma = {
      $queryRawUnsafe: vi.fn().mockResolvedValue([{ '?column?': 1 }]),
    } as unknown as PrismaService;

    const controller = new HealthController(mockPrisma);
    const result = await controller.check();

    expect(result.status).toBe('ok');
    expect(result.database).toBe('connected');
    expect(result.timestamp).toBeDefined();
    expect(mockPrisma.$queryRawUnsafe).toHaveBeenCalledWith('SELECT 1');
  });

  it('should report database as disconnected when query fails', async () => {
    const mockPrisma = {
      $queryRawUnsafe: vi.fn().mockRejectedValue(new Error('Connection failed')),
    } as unknown as PrismaService;

    const controller = new HealthController(mockPrisma);
    const result = await controller.check();

    expect(result.status).toBe('ok');
    expect(result.database).toBe('disconnected');
    expect(result.timestamp).toBeDefined();
  });
});
