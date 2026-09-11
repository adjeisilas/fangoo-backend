import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { OrderStatus } from '../../../generated/prisma/client.js';

export class UpdateOrderStatusDto {
  @IsEnum(OrderStatus, { message: 'Unknown order status' })
  status!: OrderStatus;

  @IsString()
  @IsOptional()
  @MaxLength(255)
  reason?: string;
}
