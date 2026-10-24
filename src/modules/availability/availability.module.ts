import { Module } from '@nestjs/common';
import { ServiceTypesModule } from '../service-types/service-types.module.js';
import { AvailabilityService } from './availability.service.js';
import { AvailabilityController } from './availability.controller.js';
@Module({ imports: [ServiceTypesModule], controllers: [AvailabilityController], providers: [AvailabilityService] })
export class AvailabilityModule {}
