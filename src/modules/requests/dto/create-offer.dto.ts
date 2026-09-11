import {
  IsDateString,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateOfferDto {
  @IsNumber()
  @IsPositive({ message: 'Price per litre must be greater than zero' })
  pricePerLitre!: number;

  @IsNumber()
  @IsPositive({ message: 'Available quantity must be greater than zero' })
  availableQuantity!: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  deliveryFee?: number;

  @IsDateString({}, { message: 'Delivery date must be a valid date' })
  deliveryDate!: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  notes?: string;
}
