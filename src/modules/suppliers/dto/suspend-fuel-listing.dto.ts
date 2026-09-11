import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class SuspendFuelListingDto {
  @IsBoolean()
  isSuspended!: boolean;

  @IsString()
  @IsOptional()
  @MaxLength(255)
  reason?: string;
}
