import { ApiJsonResponse, ApiErrors } from '../../common/openapi.js';
import { Controller, Get, Inject } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Type } from '@sinclair/typebox';
import { UUID } from '../../schemas.js';
import { DealershipsService } from './dealerships.service.js';
@ApiTags('Catalog')
@ApiErrors()
@Controller('dealerships')
export class DealershipsController {
  constructor(@Inject(DealershipsService) private service: DealershipsService) {}
  @Get()
  @ApiOperation({ summary: 'List dealerships' })
  @ApiJsonResponse({ status: 200, schema: Type.Array(Type.Object({ id: UUID, name: Type.String() })) })
  list() { return this.service.list(); }
}
