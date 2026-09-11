import {
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class UpdateSupplierProfileDto {
  @IsString()
  @IsOptional()
  @MaxLength(100)
  companyName?: string;

  @IsString()
  @IsOptional()
  @MaxLength(50)
  businessRegNumber?: string;

  @IsString()
  @IsOptional()
  @MaxLength(50)
  taxId?: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  description?: string;

  @IsString()
  @IsOptional()
  @MaxLength(150)
  address?: string;

  @IsString()
  @IsOptional()
  @MaxLength(50)
  city?: string;

  @IsString()
  @IsOptional()
  @MaxLength(20)
  postalCode?: string;

  @IsString()
  @IsOptional()
  @MaxLength(20)
  contactPhone?: string;

  @IsEmail({}, { message: 'Valid contact email is required' })
  @IsOptional()
  contactEmail?: string;

  @IsBoolean()
  @IsOptional()
  isAcceptingOrders?: boolean;
}
