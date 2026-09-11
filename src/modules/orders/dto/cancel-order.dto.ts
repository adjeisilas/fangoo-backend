import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CancelOrderDto {
  @IsString()
  @IsOptional()
  @MaxLength(255)
  reason?: string;
}
