import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Logger, ServiceUnavailableException } from '@nestjs/common';
import { HealthController } from './health.controller.js';
import { PrismaService } from '../../prisma/prisma.service.js';

describe('HealthController', () => {
  let logged: ReturnType<typeof vi.spyOn>;

  const prismaThat = (query: ReturnType<typeof vi.fn>) =>
    ({ $queryRaw: query }) as unknown as PrismaService;

  beforeEach(() => {
    logged = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    logged.mockRestore();
  });

  it('reports the database as connected when the query succeeds', async () => {
    const query = vi.fn().mockResolvedValue([{ '?column?': 1 }]);

    const result = await new HealthController(prismaThat(query)).check();

    expect(result.status).toBe('ok');
    expect(result.database).toBe('connected');
    expect(result.timestamp).toBeDefined();
    expect(query).toHaveBeenCalled();
  });

  /**
   * Regression: a failed query used to answer 200 with database "disconnected".
   * Container runtimes and load balancers read the status code, so a broken
   * instance stayed in rotation serving errors.
   */
  it('fails with 503 when the database does not answer', async () => {
    const query = vi.fn().mockRejectedValue(new Error('Connection failed'));
    const controller = new HealthController(prismaThat(query));

    await expect(controller.check()).rejects.toThrow(ServiceUnavailableException);
    expect(logged).toHaveBeenCalledOnce();
  });
});
