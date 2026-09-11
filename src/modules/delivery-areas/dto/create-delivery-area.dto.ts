import { IsNotEmpty, IsString } from 'class-validator';

export class CreateDeliveryAreaDto {
  @IsString()
  @IsNotEmpty({ message: 'Delivery area name is required' })
  name!: string;

  @IsString()
  @IsNotEmpty({ message: 'City is required' })
  city!: string;

  @IsString()
  @IsNotEmpty({ message: 'Region is required' })
  region!: string;
}
