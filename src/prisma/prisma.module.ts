import { TechnicianSchedule } from '../common/technician-schedule.js';
import { Global, Module, type DynamicModule } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';
@Global()
@Module({})
export class PrismaModule {
  static forClient(client: PrismaService): DynamicModule {
    return { module: PrismaModule, providers: [TechnicianSchedule, { provide: PrismaService, useValue: client }], exports: [PrismaService, TechnicianSchedule] };
  }
}
