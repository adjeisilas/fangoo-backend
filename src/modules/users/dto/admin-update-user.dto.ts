import { IsBoolean, IsEnum, IsOptional } from 'class-validator';
import { Role } from '../../../generated/prisma/client.js';

export class AdminUpdateUserDto {
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsEnum(Role, { message: 'Role must be CUSTOMER, SUPPLIER or ADMIN' })
  @IsOptional()
  role?: Role;
}
