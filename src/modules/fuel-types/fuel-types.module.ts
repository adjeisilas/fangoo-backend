import { Module } from '@nestjs/common';
import { FuelTypesService } from './fuel-types.service.js';
import { FuelTypesController } from './fuel-types.controller.js';

@Module({
  controllers: [FuelTypesController],
  providers: [FuelTypesService],
  exports: [FuelTypesService],
})
export class FuelTypesModule {}
