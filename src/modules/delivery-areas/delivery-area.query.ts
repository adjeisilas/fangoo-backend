import type { Prisma } from '../../generated/prisma/client.js';

/**
 * How a region appears in API responses: the grouping itself, without its
 * bookkeeping columns. Shared so every endpoint shows a region the same way.
 */
export const REGION_SUMMARY_SELECT = {
  id: true,
  name: true,
  capital: true,
} satisfies Prisma.RegionSelect;

/**
 * A full delivery-area row with its region, for `include`s.
 *
 * `legacyRegion` is the free-text region from before regions were modelled. It is
 * kept in the database only until a later migration drops it, and must never be
 * returned: the `region` relation is the source of truth.
 */
export const DELIVERY_AREA_WITH_REGION = {
  omit: { legacyRegion: true },
  include: { region: { select: REGION_SUMMARY_SELECT } },
} satisfies Prisma.DeliveryAreaDefaultArgs;
