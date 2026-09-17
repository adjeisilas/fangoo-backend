import {
  IsDateString,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  MAX_AMOUNT,
  MAX_AMOUNT_MESSAGE,
  MAX_LITRES,
  MAX_LITRES_MESSAGE,
  MAX_PRICE_MESSAGE,
  MAX_PRICE_PER_LITRE,
} from '../../../common/constants/money.js';

export class CreateOfferDto {
  @IsNumber()
  @IsPositive({ message: 'Price per litre must be greater than zero' })
  @Max(MAX_PRICE_PER_LITRE, { message: MAX_PRICE_MESSAGE })
  pricePerLitre!: number;

  @IsNumber()
  @IsPositive({ message: 'Available quantity must be greater than zero' })
  @Max(MAX_LITRES, { message: MAX_LITRES_MESSAGE })
  availableQuantity!: number;

  @IsNumber()
  @Min(0)
  @Max(MAX_AMOUNT, { message: MAX_AMOUNT_MESSAGE })
  @IsOptional()
  deliveryFee?: number;

  @IsDateString({}, { message: 'Delivery date must be a valid date' })
  deliveryDate!: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  notes?: string;
}
