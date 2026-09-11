import { Module } from '@nestjs/common';
import { PaymentsService } from './payments.service.js';
import { PaystackService } from './paystack.service.js';
import { PaymentsController } from './payments.controller.js';

@Module({
  controllers: [PaymentsController],
  providers: [PaymentsService, PaystackService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
