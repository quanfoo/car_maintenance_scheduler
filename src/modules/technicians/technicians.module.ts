import { Module } from '@nestjs/common';
import { TechniciansController } from './technicians.controller.js';
import { TimeOffService } from './time-off.service.js';
@Module({ controllers: [TechniciansController], providers: [TimeOffService] })
export class TechniciansModule {}
