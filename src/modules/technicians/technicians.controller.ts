import { swaggerDemo } from '../../common/swagger-demo.js';
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
@ApiParam({ name: 'id', schema: { ...UUID, default: swaggerDemo.technicianId }, description: 'Seeded Technician 2 (North Motors), with morning leave on 2030-01-17' })
@Controller('technicians/:id/time-off')
export class TechniciansController {
  constructor(@Inject(TimeOffService) private service: TimeOffService) {}
  @Get()
  @ApiOperation({ summary: 'List technician time off (administrative)', description: 'Unauthenticated demo. Production requires administrative authorization. Sorted by startsAt, id.' })
  @ApiJsonResponse({ status: 200, schema: Type.Array(TimeOffResponse) })
  list(@Param('id', new SchemaPipe(UUID)) id: string) { return this.service.list(id); }
  @Post()
  @ApiOperation({ summary: 'Create technician time off (administrative)', description: 'Half-open UTC interval; conflicting appointments or time off return 409. The prefilled interval is free in the seed data and returns 201. Repeating it returns 409; delete the created record (using its returned id) before repeating. No idempotency key support for this administrative operation.' })
  @ApiJsonBody(TimeOffInput, swaggerDemo.timeOff)
  @ApiJsonResponse({ status: 201, schema: TimeOffResponse })
  create(@Param('id', new SchemaPipe(UUID)) id: string, @Body(new SchemaPipe(TimeOffInput, false)) body: CreateTimeOffDto) { return this.service.create(id, body); }
  @Delete(':timeOffId')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete technician time off (administrative)', description: 'The prefilled id deletes Technician 2’s seeded morning absence and returns 204 (repeating returns 404). Re-run the seed to restore it. To undo a new POST, use the id returned by that POST instead.' })
  @ApiParam({ name: 'timeOffId', schema: { ...UUID, default: swaggerDemo.timeOffId }, description: 'Existing seeded morning absence for Technician 2' })
  @ApiNoContentResponse({ description: 'Deleted; technician becomes eligible if otherwise available' })
  delete(@Param('id', new SchemaPipe(UUID)) id: string, @Param('timeOffId', new SchemaPipe(UUID)) timeOffId: string) { return this.service.delete(id, timeOffId); }
}
