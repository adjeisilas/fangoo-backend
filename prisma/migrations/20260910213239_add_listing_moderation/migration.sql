-- AlterTable
ALTER TABLE "supplier_fuels" ADD COLUMN     "is_suspended" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "suspension_reason" TEXT;
