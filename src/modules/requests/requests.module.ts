import { Module } from '@nestjs/common';
import { RequestsService } from './requests.service.js';
import { RequestsController } from './requests.controller.js';

@Module({
  controllers: [RequestsController],
  providers: [RequestsService],
  exports: [RequestsService],
})
export class RequestsModule {}
