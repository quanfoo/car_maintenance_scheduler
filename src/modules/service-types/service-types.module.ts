import { Module } from '@nestjs/common';
import { ServiceTypesService } from './service-types.service.js';
import { ServiceTypesController } from './service-types.controller.js';
@Module({ providers: [ServiceTypesService], controllers: [ServiceTypesController], exports: [ServiceTypesService] })
export class ServiceTypesModule {}
