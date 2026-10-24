import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Post } from '@nestjs/common';
import { ApiNoContentResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { Type } from '@sinclair/typebox';
import { ApiErrors, ApiJsonResponse, ApiJsonBody } from '../../common/openapi.js';
import { SchemaPipe } from '../../common/schema.pipe.js';
import { UUID } from '../../schemas.js';
import { CreateTimeOffDto, TimeOffInput, TimeOffResponse } from './time-off.dto.js';
import { TimeOffService } from './time-off.service.js';
@ApiTags('Technicians — administrative demo operations')
@ApiErrors()
@ApiParam({ name: 'id', schema: UUID })
@Controller('technicians/:id/time-off')
export class TechniciansController {
  constructor(@Inject(TimeOffService) private service: TimeOffService) {}
  @Get()
  @ApiOperation({ summary: 'List technician time off (administrative)', description: 'Unauthenticated demo. Production requires administrative authorization. Sorted by startsAt, id.' })
  @ApiJsonResponse({ status: 200, schema: Type.Array(TimeOffResponse) })
  list(@Param('id', new SchemaPipe(UUID)) id: string) { return this.service.list(id); }
  @Post()
  @ApiOperation({ summary: 'Create technician time off (administrative)', description: 'Half-open UTC interval; conflicting appointments or time off return 409. No idempotency key support for this administrative operation.' })
  @ApiJsonBody(TimeOffInput)
  @ApiJsonResponse({ status: 201, schema: TimeOffResponse })
  create(@Param('id', new SchemaPipe(UUID)) id: string, @Body(new SchemaPipe(TimeOffInput, false)) body: CreateTimeOffDto) { return this.service.create(id, body); }
  @Delete(':timeOffId')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete technician time off (administrative)' })
  @ApiParam({ name: 'timeOffId', schema: UUID })
  @ApiNoContentResponse({ description: 'Deleted; technician becomes eligible if otherwise available' })
  delete(@Param('id', new SchemaPipe(UUID)) id: string, @Param('timeOffId', new SchemaPipe(UUID)) timeOffId: string) { return this.service.delete(id, timeOffId); }
}
