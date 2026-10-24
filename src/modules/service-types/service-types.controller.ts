import { ApiJsonResponse, ApiErrors } from '../../common/openapi.js';
import { Controller, Get, Inject, Param } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { Type } from '@sinclair/typebox';
import { SchemaPipe } from '../../common/schema.pipe.js';
import { UUID, errors } from '../../schemas.js';
import { ServiceTypesService } from './service-types.service.js';
@ApiTags('Catalog')
@ApiErrors()
@Controller('dealerships/:dealershipId/service-types')
export class ServiceTypesController {
  constructor(@Inject(ServiceTypesService) private service: ServiceTypesService) {}
  @Get()
  @ApiOperation({ summary: 'Services offered at a dealership' })
  @ApiParam({ name: 'dealershipId', schema: UUID })
  @ApiJsonResponse({ status: 200, schema: Type.Array(Type.Object({ id: UUID, name: Type.String(), durationMinutes: Type.Integer() })) })
  @ApiJsonResponse({ status: 404, schema: errors[404] })
  list(@Param('dealershipId', new SchemaPipe(UUID)) id: string) { return this.service.list(id); }
}
