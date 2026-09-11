import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateSupplierProfileDto {
  @IsString()
  @IsNotEmpty({ message: 'Company name is required' })
  @MaxLength(100)
  companyName!: string;

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
  @IsNotEmpty({ message: 'Business address is required' })
  @MaxLength(150)
  address!: string;

  @IsString()
  @IsNotEmpty({ message: 'City is required' })
  @MaxLength(50)
  city!: string;

  @IsString()
  @IsOptional()
  @MaxLength(20)
  postalCode?: string;

  @IsString()
  @IsNotEmpty({ message: 'Contact phone number is required' })
  @MaxLength(20)
  contactPhone!: string;

  @IsEmail({}, { message: 'Valid contact email is required' })
  contactEmail!: string;
}
