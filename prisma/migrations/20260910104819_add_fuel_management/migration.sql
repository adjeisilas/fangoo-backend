-- CreateTable
CREATE TABLE "fuel_types" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fuel_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_fuels" (
    "id" TEXT NOT NULL,
    "supplier_profile_id" TEXT NOT NULL,
    "fuel_type_id" TEXT NOT NULL,
    "price_per_litre" DECIMAL(10,2) NOT NULL,
    "available_quantity" DECIMAL(12,2) NOT NULL,
    "is_available" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "supplier_fuels_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "fuel_types_name_key" ON "fuel_types"("name");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_fuels_supplier_profile_id_fuel_type_id_key" ON "supplier_fuels"("supplier_profile_id", "fuel_type_id");

-- AddForeignKey
ALTER TABLE "supplier_fuels" ADD CONSTRAINT "supplier_fuels_supplier_profile_id_fkey" FOREIGN KEY ("supplier_profile_id") REFERENCES "supplier_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_fuels" ADD CONSTRAINT "supplier_fuels_fuel_type_id_fkey" FOREIGN KEY ("fuel_type_id") REFERENCES "fuel_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;
