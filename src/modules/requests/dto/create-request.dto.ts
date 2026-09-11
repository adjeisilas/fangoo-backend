import {
  IsDateString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
} from 'class-validator';

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
  quantityLitres!: number;

  @IsDateString({}, { message: 'Required-by date must be a valid date' })
  requiredBy!: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  notes?: string;
}
