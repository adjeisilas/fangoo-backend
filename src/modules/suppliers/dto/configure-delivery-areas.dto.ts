import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class DeliveryAreaAssignmentDto {
  @IsString()
  deliveryAreaId!: string;

  @IsNumber()
  @Min(0)
  @IsOptional()
  deliveryFee?: number;

  @IsInt()
  @Min(1)
  @IsOptional()
  estimatedDeliveryHours?: number;
}

export class ConfigureDeliveryAreasDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DeliveryAreaAssignmentDto)
  areas!: DeliveryAreaAssignmentDto[];
}
