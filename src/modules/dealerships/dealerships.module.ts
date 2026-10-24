import { Module } from '@nestjs/common';
import { DealershipsController } from './dealerships.controller.js';
import { DealershipsService } from './dealerships.service.js';
@Module({ controllers: [DealershipsController], providers: [DealershipsService] })
export class DealershipsModule {}
