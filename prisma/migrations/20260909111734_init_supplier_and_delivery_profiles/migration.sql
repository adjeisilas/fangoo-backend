-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED');

-- CreateTable
CREATE TABLE "supplier_profiles" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "company_name" TEXT NOT NULL,
    "business_reg_number" TEXT,
    "tax_id" TEXT,
    "description" TEXT,
    "address" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "postal_code" TEXT,
    "contact_phone" TEXT NOT NULL,
    "contact_email" TEXT NOT NULL,
    "verification_status" "VerificationStatus" NOT NULL DEFAULT 'PENDING',
    "verified_at" TIMESTAMP(3),
    "rejection_reason" TEXT,
    "is_accepting_orders" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "supplier_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_areas" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "delivery_areas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_delivery_areas" (
    "id" TEXT NOT NULL,
    "supplier_profile_id" TEXT NOT NULL,
    "delivery_area_id" TEXT NOT NULL,
    "delivery_fee" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "estimated_delivery_hours" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supplier_delivery_areas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "supplier_profiles_user_id_key" ON "supplier_profiles"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "delivery_areas_name_key" ON "delivery_areas"("name");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_delivery_areas_supplier_profile_id_delivery_area_i_key" ON "supplier_delivery_areas"("supplier_profile_id", "delivery_area_id");

-- AddForeignKey
ALTER TABLE "supplier_profiles" ADD CONSTRAINT "supplier_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_delivery_areas" ADD CONSTRAINT "supplier_delivery_areas_supplier_profile_id_fkey" FOREIGN KEY ("supplier_profile_id") REFERENCES "supplier_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_delivery_areas" ADD CONSTRAINT "supplier_delivery_areas_delivery_area_id_fkey" FOREIGN KEY ("delivery_area_id") REFERENCES "delivery_areas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
