import { Module } from '@nestjs/common';
import { ServiceTypesModule } from '../service-types/service-types.module.js';
import { AppointmentsController } from './appointments.controller.js';
import { AppointmentsService } from './appointments.service.js';
import { BookingService } from './booking.service.js';
import { AllocationQueries } from './allocation.queries.js';
@Module({ imports: [ServiceTypesModule], controllers: [AppointmentsController], providers: [AppointmentsService, BookingService, AllocationQueries], exports: [BookingService] })
export class AppointmentsModule {}
