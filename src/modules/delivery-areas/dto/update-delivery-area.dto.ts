import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

/** Every field is optional; only the ones sent are changed. */
export class UpdateDeliveryAreaDto {
  @IsOptional()
  @IsString()
  @Matches(/\S/, { message: 'Delivery area name cannot be blank' })
  @MaxLength(100, { message: 'Delivery area name cannot exceed 100 characters' })
  name?: string;

  @IsOptional()
  @IsString()
  @Matches(/\S/, { message: 'City cannot be blank' })
  @MaxLength(50, { message: 'City cannot exceed 50 characters' })
  city?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'Region cannot be blank' })
  regionId?: string;

  /**
   * An inactive area is hidden from every list and takes no new orders,
   * requests or supplier coverage. Existing records are left as they are.
   */
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
