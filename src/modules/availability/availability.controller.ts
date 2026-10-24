import { swaggerDemo } from '../../common/swagger-demo.js';
import { ApiJsonResponse, ApiErrors } from '../../common/openapi.js';
import { Controller, Get, Inject, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Type, type Static } from '@sinclair/typebox';
import { SchemaPipe } from '../../common/schema.pipe.js';
import { AvailabilityQuery, UUID, Timestamp } from '../../schemas.js';
import { AvailabilityService } from './availability.service.js';
@ApiTags('Availability')
@ApiErrors()
@Controller('availability')
export class AvailabilityController {
  constructor(@Inject(AvailabilityService) private service: AvailabilityService) {}
  @Get()
  @ApiOperation({ summary: '48 advisory half-hour starts on a UTC date', description: 'Checks full service intervals; a slot may finish next day. Availability never reserves resources.' })
  @ApiQuery({ name: 'dealershipId', schema: { ...UUID, default: swaggerDemo.dealershipId }, description: 'Seeded North Motors dealership' })
  @ApiQuery({ name: 'serviceTypeId', schema: { ...UUID, default: swaggerDemo.serviceTypeId }, description: 'Seeded 30-minute oil change' })
  @ApiQuery({ name: 'date', schema: { type: 'string', format: 'date', default: swaggerDemo.date }, description: 'UTC seed date: includes free, partially available and fully booked slots' })
  @ApiJsonResponse({ status: 200, schema: Type.Object({ dealershipId: UUID, serviceTypeId: UUID, date: Type.String(), timezone: Type.Literal('UTC'), intervalMinutes: Type.Literal(30), durationMinutes: Type.Integer(), advisory: Type.Literal(true), slots: Type.Array(Type.Object({ startTime: Timestamp, endTime: Timestamp, available: Type.Boolean() })) }) })
  get(@Query(new SchemaPipe(AvailabilityQuery)) query: Static<typeof AvailabilityQuery>) { return this.service.get(query.dealershipId, query.serviceTypeId, query.date); }
}
