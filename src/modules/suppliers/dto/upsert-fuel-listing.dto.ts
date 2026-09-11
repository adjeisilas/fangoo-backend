import {
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class UpsertFuelListingDto {
  @IsString()
  fuelTypeId!: string;

  @IsNumber()
  @Min(0)
  pricePerLitre!: number;

  @IsNumber()
  @Min(0)
  availableQuantity!: number;

  @IsNumber()
  @Min(0.01, { message: 'Minimum order must be greater than zero' })
  @IsOptional()
  minimumOrderLitres?: number;

  @IsBoolean()
  @IsOptional()
  isAvailable?: boolean;
}
