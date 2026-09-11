import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class RefundOrderDto {
  /**
   * Why the money is going back. Written to the order history and sent to Paystack
   * as the merchant note, so there is a record on both sides.
   */
  @IsString()
  @IsOptional()
  @MinLength(3)
  @MaxLength(300)
  reason?: string;
}
