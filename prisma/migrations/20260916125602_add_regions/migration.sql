-- Regions: Ghana's 16 administrative regions, linked from delivery_areas.region_id.
--
-- Hand-edited from `prisma migrate dev --create-only`. The generated script added
-- region_id as NOT NULL in a single step, which cannot run against a table that
-- already has rows. This version instead:
--   1. creates `regions` and inserts the 16 regions with fixed ids,
--   2. adds `delivery_areas.region_id` as nullable,
--   3. backfills it from the existing free-text `region` column,
--   4. aborts, naming the rows, if any delivery area is still unmapped,
--   5. only then makes `region_id` NOT NULL and adds its index and foreign key.
--
-- No delivery area is deleted or re-keyed, so supplier coverage, orders and
-- requests keep pointing at the same rows. The old `region` column is kept (now
-- nullable) and is dropped in a later migration once the backfill is verified.
--
-- Safe to run again: every step is guarded (IF NOT EXISTS, ON CONFLICT,
-- WHERE region_id IS NULL, or a catalogue check).
--
-- There is deliberately no BEGIN/COMMIT, matching Prisma's own migrations.
-- PostgreSQL runs a multi-statement script sent in one go as a single implicit
-- transaction, so any failure rolls every step back. An explicit BEGIN instead
-- leaves the connection in an aborted transaction after an error, which stops
-- Prisma recording the real error message.

-- CreateTable
CREATE TABLE IF NOT EXISTS "regions" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "capital" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "regions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "regions_name_key" ON "regions"("name");

-- The 16 regions, with ids fixed so every environment shares them. A row whose id
-- already exists is left untouched. A matching name under a different id still
-- fails on regions_name_key, deliberately: it means the data disagrees.
INSERT INTO "regions" ("id", "name", "capital", "updated_at") VALUES
    ('00000000-0000-4000-8000-000000000001', 'Ahafo Region',         'Goaso',            CURRENT_TIMESTAMP),
    ('00000000-0000-4000-8000-000000000002', 'Ashanti Region',       'Kumasi',           CURRENT_TIMESTAMP),
    ('00000000-0000-4000-8000-000000000003', 'Bono Region',          'Sunyani',          CURRENT_TIMESTAMP),
    ('00000000-0000-4000-8000-000000000004', 'Bono East Region',     'Techiman',         CURRENT_TIMESTAMP),
    ('00000000-0000-4000-8000-000000000005', 'Central Region',       'Cape Coast',       CURRENT_TIMESTAMP),
    ('00000000-0000-4000-8000-000000000006', 'Eastern Region',       'Koforidua',        CURRENT_TIMESTAMP),
    ('00000000-0000-4000-8000-000000000007', 'Greater Accra Region', 'Accra',            CURRENT_TIMESTAMP),
    ('00000000-0000-4000-8000-000000000008', 'North East Region',    'Nalerigu',         CURRENT_TIMESTAMP),
    ('00000000-0000-4000-8000-000000000009', 'Northern Region',      'Tamale',           CURRENT_TIMESTAMP),
    ('00000000-0000-4000-8000-000000000010', 'Oti Region',           'Dambai',           CURRENT_TIMESTAMP),
    ('00000000-0000-4000-8000-000000000011', 'Savannah Region',      'Damongo',          CURRENT_TIMESTAMP),
    ('00000000-0000-4000-8000-000000000012', 'Upper East Region',    'Bolgatanga',       CURRENT_TIMESTAMP),
    ('00000000-0000-4000-8000-000000000013', 'Upper West Region',    'Wa',               CURRENT_TIMESTAMP),
    ('00000000-0000-4000-8000-000000000014', 'Volta Region',         'Ho',               CURRENT_TIMESTAMP),
    ('00000000-0000-4000-8000-000000000015', 'Western Region',       'Sekondi-Takoradi', CURRENT_TIMESTAMP),
    ('00000000-0000-4000-8000-000000000016', 'Western North Region', 'Sefwi Wiawso',     CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

-- AlterTable: the legacy text becomes optional. New areas are created by region_id.
ALTER TABLE "delivery_areas" ALTER COLUMN "region" DROP NOT NULL;

-- AlterTable: nullable first, so the existing rows can be backfilled.
ALTER TABLE "delivery_areas" ADD COLUMN IF NOT EXISTS "region_id" TEXT;

-- Backfill from the legacy text, accepting either "<Name> Region" or "<Name>",
-- ignoring case and surrounding spaces. Every region name ends in " Region", and
-- no shortened form is shared by two regions ("Western" is not "Western North").
UPDATE "delivery_areas" AS da
SET "region_id" = r."id"
FROM "regions" AS r
WHERE da."region_id" IS NULL
  AND lower(btrim(da."region")) IN (
        lower(r."name"),
        lower(left(r."name", -length(' Region')))
      );

-- Refuse to continue while any delivery area is unmapped, and say which.
DO $$
DECLARE
    unmapped TEXT;
BEGIN
    SELECT string_agg(format('%s (%s)', "name", coalesce("region", 'no region text')), ', ')
      INTO unmapped
      FROM "delivery_areas"
     WHERE "region_id" IS NULL;

    IF unmapped IS NOT NULL THEN
        RAISE EXCEPTION 'Cannot link delivery areas to regions. Unmapped: %', unmapped;
    END IF;
END $$;

-- AlterTable
ALTER TABLE "delivery_areas" ALTER COLUMN "region_id" SET NOT NULL;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "delivery_areas_region_id_idx" ON "delivery_areas"("region_id");

-- AddForeignKey. ADD CONSTRAINT has no IF NOT EXISTS, so check the catalogue first.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
          FROM pg_constraint
         WHERE conname = 'delivery_areas_region_id_fkey'
           AND conrelid = '"delivery_areas"'::regclass
    ) THEN
        ALTER TABLE "delivery_areas"
            ADD CONSTRAINT "delivery_areas_region_id_fkey"
            FOREIGN KEY ("region_id") REFERENCES "regions"("id")
            ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;
