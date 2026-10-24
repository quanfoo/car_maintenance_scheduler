import { TechniciansModule } from './modules/technicians/technicians.module.js';
import { Module, type DynamicModule } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module.js';
import { PrismaService } from './prisma/prisma.service.js';
import { DealershipsModule } from './modules/dealerships/dealerships.module.js';
import { ServiceTypesModule } from './modules/service-types/service-types.module.js';
import { AvailabilityModule } from './modules/availability/availability.module.js';
import { AppointmentsModule } from './modules/appointments/appointments.module.js';
import { OperationsModule } from './modules/operations/operations.module.js';
@Module({})
export class AppModule {
  static forClient(prisma: PrismaService): DynamicModule {
    return { module: AppModule, imports: [PrismaModule.forClient(prisma), OperationsModule, TechniciansModule, DealershipsModule, ServiceTypesModule, AvailabilityModule, AppointmentsModule] };
  }
}
