import {
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import {
  MAX_LITRES,
  MAX_LITRES_MESSAGE,
  MAX_PRICE_MESSAGE,
  MAX_PRICE_PER_LITRE,
} from '../../../common/constants/money.js';

export class UpsertFuelListingDto {
  @IsString()
  fuelTypeId!: string;

  @IsNumber()
  @Min(0)
  @Max(MAX_PRICE_PER_LITRE, { message: MAX_PRICE_MESSAGE })
  pricePerLitre!: number;

  @IsNumber()
  @Min(0)
  @Max(MAX_LITRES, { message: MAX_LITRES_MESSAGE })
  availableQuantity!: number;

  @IsNumber()
  @Min(0.01, { message: 'Minimum order must be greater than zero' })
  @Max(MAX_LITRES, { message: MAX_LITRES_MESSAGE })
  @IsOptional()
  minimumOrderLitres?: number;

  @IsBoolean()
  @IsOptional()
  isAvailable?: boolean;
}
