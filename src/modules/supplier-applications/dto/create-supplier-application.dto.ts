import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { CreateSupplierProfileDto } from '../../suppliers/dto/create-supplier-profile.dto.js';
import { DeliveryAreaAssignmentDto } from '../../suppliers/dto/configure-delivery-areas.dto.js';

/**
 * The person applying. The same rules and messages as `RegisterDto`, minus
 * `role`: an application always creates a supplier, and with the global
 * `forbidNonWhitelisted` pipe a `role` sent here is rejected outright.
 */
export class SupplierApplicationAccountDto {
  @IsEmail({}, { message: 'Please provide a valid email address' })
  email!: string;

  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  @MaxLength(64, { message: 'Password cannot exceed 64 characters' })
  password!: string;

  @IsString()
  @IsNotEmpty({ message: 'First name is required' })
  firstName!: string;

  @IsString()
  @IsNotEmpty({ message: 'Last name is required' })
  lastName!: string;

  @IsString()
  @IsOptional()
  phone?: string;
}

export class CreateSupplierApplicationDto {
  @IsObject({ message: 'Account details are required' })
  @ValidateNested()
  @Type(() => SupplierApplicationAccountDto)
  account!: SupplierApplicationAccountDto;

  @IsObject({ message: 'Business details are required' })
  @ValidateNested()
  @Type(() => CreateSupplierProfileDto)
  business!: CreateSupplierProfileDto;

  @IsArray({ message: 'Delivery coverage is required' })
  @ArrayMinSize(1, { message: 'Choose at least one delivery area' })
  @ValidateNested({ each: true })
  @Type(() => DeliveryAreaAssignmentDto)
  coverage!: DeliveryAreaAssignmentDto[];
}
