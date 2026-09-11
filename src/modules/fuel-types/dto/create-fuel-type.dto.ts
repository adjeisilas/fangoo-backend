import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateFuelTypeDto {
  @IsString()
  @IsNotEmpty({ message: 'Fuel type name is required' })
  @MaxLength(50)
  name!: string;
}
