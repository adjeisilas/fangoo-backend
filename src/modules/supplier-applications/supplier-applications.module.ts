import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { SupplierApplicationsController } from './supplier-applications.controller.js';
import { SupplierApplicationsService } from './supplier-applications.service.js';

/**
 * A leaf module: it depends on AuthModule for sessions, and nothing depends on
 * it, so Auth and Suppliers stay unaware of each other. Supplier data rules are
 * shared as plain helpers from the suppliers folder, not through injection.
 */
@Module({
  imports: [AuthModule],
  controllers: [SupplierApplicationsController],
  providers: [SupplierApplicationsService],
})
export class SupplierApplicationsModule {}
