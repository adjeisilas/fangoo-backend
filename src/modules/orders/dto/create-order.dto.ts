import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  Max,
  IsArray,
  IsNotEmpty,
  IsNumber,
  IsPositive,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import {
  MAX_LITRES,
  MAX_LITRES_MESSAGE,
} from '../../../common/constants/money.js';

export class CreateOrderItemDto {
  @IsString()
  @IsNotEmpty({ message: 'Fuel type is required' })
  fuelTypeId!: string;

  @IsNumber()
  @IsPositive({ message: 'Quantity must be greater than zero' })
  @Max(MAX_LITRES, { message: MAX_LITRES_MESSAGE })
  quantity!: number;
}

export class CreateOrderDto {
  @IsString()
  @IsNotEmpty({ message: 'Supplier is required' })
  supplierId!: string;

  @IsString()
  @IsNotEmpty({ message: 'Delivery area is required' })
  deliveryAreaId!: string;

  @IsString()
  @IsNotEmpty({ message: 'Delivery address is required' })
  @MaxLength(200)
  deliveryAddress!: string;

  @IsArray()
  @ArrayMinSize(1, { message: 'At least one order item is required' })
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  items!: CreateOrderItemDto[];
}
