import { IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';

export class CreateDeliveryAreaDto {
  // `Matches(/\S/)` rather than `IsNotEmpty`: a name of only spaces would
  // otherwise pass, then be trimmed to nothing.
  @IsString()
  @Matches(/\S/, { message: 'Delivery area name is required' })
  @MaxLength(100, { message: 'Delivery area name cannot exceed 100 characters' })
  name!: string;

  @IsString()
  @Matches(/\S/, { message: 'City is required' })
  @MaxLength(50, { message: 'City cannot exceed 50 characters' })
  city!: string;

  /** One of the ids listed by `GET /delivery-areas/regions`. */
  @IsString()
  @IsNotEmpty({ message: 'Region is required' })
  regionId!: string;
}
