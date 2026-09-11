import { Module } from '@nestjs/common';
import { DeliveryAreasService } from './delivery-areas.service.js';
import { DeliveryAreasController } from './delivery-areas.controller.js';

@Module({
  controllers: [DeliveryAreasController],
  providers: [DeliveryAreasService],
  exports: [DeliveryAreasService],
})
export class DeliveryAreasModule {}
