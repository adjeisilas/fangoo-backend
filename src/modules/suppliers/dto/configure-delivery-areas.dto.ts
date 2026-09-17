import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  MAX_AMOUNT,
  MAX_AMOUNT_MESSAGE,
} from '../../../common/constants/money.js';

export class DeliveryAreaAssignmentDto {
  @IsString()
  deliveryAreaId!: string;

  @IsNumber()
  @Min(0)
  @Max(MAX_AMOUNT, { message: MAX_AMOUNT_MESSAGE })
  @IsOptional()
  deliveryFee?: number;

  @IsInt()
  @Min(1)
  @Max(24 * 30, { message: 'Delivery time must be within 30 days' })
  @IsOptional()
  estimatedDeliveryHours?: number;
}

export class ConfigureDeliveryAreasDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DeliveryAreaAssignmentDto)
  areas!: DeliveryAreaAssignmentDto[];
}
