import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { VerificationStatus } from '../../../generated/prisma/client.js';

export class VerifySupplierDto {
  @IsEnum(VerificationStatus, {
    message: 'Status must be either VERIFIED or REJECTED',
  })
  status!: VerificationStatus;

  @IsString()
  @IsOptional()
  @MaxLength(255)
  rejectionReason?: string;
}
