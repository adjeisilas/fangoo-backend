import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import type { DeliveryAreaAssignmentDto } from './dto/configure-delivery-areas.dto.js';

/**
 * Rejects a coverage list that names the same area twice. Counting existing rows
 * cannot tell a repeat from a missing area, and the unique (supplier, area) index
 * would only reject it later with a far less useful error. Needs no database, so
 * callers can run it before doing anything expensive.
 */
export function assertNoRepeatedDeliveryAreas(
  areas: DeliveryAreaAssignmentDto[],
): void {
  const ids = areas.map((area) => area.deliveryAreaId);
  const repeated = [
    ...new Set(ids.filter((id, index) => ids.indexOf(id) !== index)),
  ];

  if (repeated.length > 0) {
    throw new BadRequestException(
      `Each delivery area can only be listed once (repeated: ${repeated.join(', ')})`,
    );
  }
}

/**
 * Checks a coverage list before it is written: no repeats, every area exists,
 * and none is paused — an inactive area takes no new coverage. Accepts the
 * Prisma client or a transaction client, so a caller can validate inside its
 * own transaction.
 */
export async function assertDeliveryAreasAvailable(
  db: Pick<Prisma.TransactionClient, 'deliveryArea'>,
  areas: DeliveryAreaAssignmentDto[],
): Promise<void> {
  assertNoRepeatedDeliveryAreas(areas);

  const ids = areas.map((area) => area.deliveryAreaId);
  if (ids.length === 0) return;

  const found = await db.deliveryArea.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true, isActive: true },
  });

  if (found.length !== ids.length) {
    throw new NotFoundException('One or more delivery area IDs are invalid');
  }

  const paused = found.filter((area) => !area.isActive).map((area) => area.name);

  if (paused.length > 0) {
    throw new BadRequestException(
      `These delivery areas are paused and cannot be added to coverage: ${paused.join(', ')}`,
    );
  }
}

/** Coverage rows for `createMany`, with the same defaults everywhere. */
export const toCoverageRows = (
  supplierProfileId: string,
  areas: DeliveryAreaAssignmentDto[],
) =>
  areas.map((area) => ({
    supplierProfileId,
    deliveryAreaId: area.deliveryAreaId,
    deliveryFee: area.deliveryFee ?? 0,
    estimatedDeliveryHours: area.estimatedDeliveryHours ?? null,
  }));
