import { IsBoolean, IsNumber, IsOptional, Min } from 'class-validator';

export class UpdateFuelListingDto {
  @IsNumber()
  @Min(0)
  @IsOptional()
  pricePerLitre?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  availableQuantity?: number;

  @IsNumber()
  @Min(0.01, { message: 'Minimum order must be greater than zero' })
  @IsOptional()
  minimumOrderLitres?: number;

  @IsBoolean()
  @IsOptional()
  isAvailable?: boolean;
}
