-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('OPEN', 'AWARDED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "OfferStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'WITHDRAWN', 'EXPIRED');

-- CreateEnum
CREATE TYPE "OrderSource" AS ENUM ('CATALOGUE', 'REQUEST');

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "source" "OrderSource" NOT NULL DEFAULT 'CATALOGUE';

-- CreateTable
CREATE TABLE "fuel_requests" (
    "id" TEXT NOT NULL,
    "buyer_id" TEXT NOT NULL,
    "fuel_type_id" TEXT NOT NULL,
    "delivery_area_id" TEXT NOT NULL,
    "delivery_address" TEXT NOT NULL,
    "quantity_litres" DECIMAL(12,2) NOT NULL,
    "required_by" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "status" "RequestStatus" NOT NULL DEFAULT 'OPEN',
    "order_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fuel_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "offers" (
    "id" TEXT NOT NULL,
    "request_id" TEXT NOT NULL,
    "supplier_profile_id" TEXT NOT NULL,
    "price_per_litre" DECIMAL(10,2) NOT NULL,
    "available_quantity" DECIMAL(12,2) NOT NULL,
    "delivery_fee" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "delivery_date" TIMESTAMP(3) NOT NULL,
    "subtotal" DECIMAL(12,2) NOT NULL,
    "total_amount" DECIMAL(12,2) NOT NULL,
    "notes" TEXT,
    "status" "OfferStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "offers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "fuel_requests_order_id_key" ON "fuel_requests"("order_id");

-- CreateIndex
CREATE INDEX "fuel_requests_status_idx" ON "fuel_requests"("status");

-- CreateIndex
CREATE INDEX "fuel_requests_buyer_id_idx" ON "fuel_requests"("buyer_id");

-- CreateIndex
CREATE INDEX "offers_supplier_profile_id_idx" ON "offers"("supplier_profile_id");

-- CreateIndex
CREATE UNIQUE INDEX "offers_request_id_supplier_profile_id_key" ON "offers"("request_id", "supplier_profile_id");

-- AddForeignKey
ALTER TABLE "fuel_requests" ADD CONSTRAINT "fuel_requests_buyer_id_fkey" FOREIGN KEY ("buyer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fuel_requests" ADD CONSTRAINT "fuel_requests_fuel_type_id_fkey" FOREIGN KEY ("fuel_type_id") REFERENCES "fuel_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fuel_requests" ADD CONSTRAINT "fuel_requests_delivery_area_id_fkey" FOREIGN KEY ("delivery_area_id") REFERENCES "delivery_areas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fuel_requests" ADD CONSTRAINT "fuel_requests_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offers" ADD CONSTRAINT "offers_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "fuel_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offers" ADD CONSTRAINT "offers_supplier_profile_id_fkey" FOREIGN KEY ("supplier_profile_id") REFERENCES "supplier_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
