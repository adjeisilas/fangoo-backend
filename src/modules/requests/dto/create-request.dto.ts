import {
  IsDateString,
  Max,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
} from 'class-validator';
import {
  MAX_LITRES,
  MAX_LITRES_MESSAGE,
} from '../../../common/constants/money.js';

export class CreateRequestDto {
  @IsString()
  @IsNotEmpty({ message: 'Fuel type is required' })
  fuelTypeId!: string;

  @IsString()
  @IsNotEmpty({ message: 'Delivery area is required' })
  deliveryAreaId!: string;

  @IsString()
  @IsNotEmpty({ message: 'Delivery address is required' })
  @MaxLength(200)
  deliveryAddress!: string;

  @IsNumber()
  @IsPositive({ message: 'Quantity must be greater than zero' })
  @Max(MAX_LITRES, { message: MAX_LITRES_MESSAGE })
  quantityLitres!: number;

  @IsDateString({}, { message: 'Required-by date must be a valid date' })
  requiredBy!: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  notes?: string;
}
