import { describe, it, expect, vi } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  assertDeliveryAreasAvailable,
  assertNoRepeatedDeliveryAreas,
  toCoverageRows,
} from './supplier-coverage.js';

const db = (rows: Array<{ id: string; name: string; isActive: boolean }>) => ({
  deliveryArea: { findMany: vi.fn().mockResolvedValue(rows) },
});

const active = (id: string, name = id) => ({ id, name, isActive: true });

describe('assertNoRepeatedDeliveryAreas', () => {
  it('accepts distinct areas', () => {
    expect(() =>
      assertNoRepeatedDeliveryAreas([
        { deliveryAreaId: 'a' },
        { deliveryAreaId: 'b' },
      ]),
    ).not.toThrow();
  });

  it('rejects an area listed twice, naming it once', () => {
    let error: unknown;
    try {
      assertNoRepeatedDeliveryAreas([
        { deliveryAreaId: 'a' },
        { deliveryAreaId: 'b' },
        { deliveryAreaId: 'a' },
        { deliveryAreaId: 'a' },
      ]);
    } catch (err) {
      error = err;
    }

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as Error).message).toBe(
      'Each delivery area can only be listed once (repeated: a)',
    );
  });
});

describe('assertDeliveryAreasAvailable', () => {
  it('passes when every area exists and is active', async () => {
    const client = db([active('a'), active('b')]);

    await expect(
      assertDeliveryAreasAvailable(client as any, [
        { deliveryAreaId: 'a' },
        { deliveryAreaId: 'b' },
      ]),
    ).resolves.toBeUndefined();

    expect(client.deliveryArea.findMany).toHaveBeenCalledWith({
      where: { id: { in: ['a', 'b'] } },
      select: { id: true, name: true, isActive: true },
    });
  });

  it('rejects an unknown area with the existing message', async () => {
    await expect(
      assertDeliveryAreasAvailable(db([active('a')]) as any, [
        { deliveryAreaId: 'a' },
        { deliveryAreaId: 'missing' },
      ]),
    ).rejects.toThrow(new NotFoundException('One or more delivery area IDs are invalid'));
  });

  /** A paused area takes no new coverage, and the message names it. */
  it('rejects a paused area by name', async () => {
    const client = db([
      active('a', 'Accra Metropolitan Area'),
      { id: 'b', name: 'Tema Metropolitan Area', isActive: false },
    ]);

    await expect(
      assertDeliveryAreasAvailable(client as any, [
        { deliveryAreaId: 'a' },
        { deliveryAreaId: 'b' },
      ]),
    ).rejects.toThrow(
      new BadRequestException(
        'These delivery areas are paused and cannot be added to coverage: Tema Metropolitan Area',
      ),
    );
  });

  /** A repeat must be reported as a repeat, not as a missing area. */
  it('rejects a repeat before touching the database', async () => {
    const client = db([active('a')]);

    await expect(
      assertDeliveryAreasAvailable(client as any, [
        { deliveryAreaId: 'a' },
        { deliveryAreaId: 'a' },
      ]),
    ).rejects.toThrow(BadRequestException);

    expect(client.deliveryArea.findMany).not.toHaveBeenCalled();
  });

  it('does not query for an empty list', async () => {
    const client = db([]);

    await expect(assertDeliveryAreasAvailable(client as any, [])).resolves.toBeUndefined();
    expect(client.deliveryArea.findMany).not.toHaveBeenCalled();
  });
});

describe('toCoverageRows', () => {
  it('applies the same defaults as before: fee 0, no lead time', () => {
    expect(
      toCoverageRows('profile-1', [
        { deliveryAreaId: 'a' },
        { deliveryAreaId: 'b', deliveryFee: 40, estimatedDeliveryHours: 6 },
      ]),
    ).toEqual([
      { supplierProfileId: 'profile-1', deliveryAreaId: 'a', deliveryFee: 0, estimatedDeliveryHours: null },
      { supplierProfileId: 'profile-1', deliveryAreaId: 'b', deliveryFee: 40, estimatedDeliveryHours: 6 },
    ]);
  });
});
