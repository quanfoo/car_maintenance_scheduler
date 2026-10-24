import { swaggerDemo } from '../../common/swagger-demo.js';
import { ApiJsonResponse, ApiErrors, ApiJsonBody } from '../../common/openapi.js';
import { Body, Controller, Get, Headers, Inject, Param, Post, Query, Res } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { FastifyReply } from 'fastify';
import { Type } from '@sinclair/typebox';
import { SchemaPipe } from '../../common/schema.pipe.js';
import { CreateAppointmentDto } from '../../common/dto.js';
import { Metrics } from '../../common/metrics.js';
import { Appointment, Booking, ListQuery, UUID, errors, type ListFilters } from '../../schemas.js';
import { BookingService } from './booking.service.js';
import { AppointmentsService } from './appointments.service.js';
const Key = Type.Optional(Type.String({ minLength: 1, maxLength: 128, pattern: '^[A-Za-z0-9._:-]+$' }));
@ApiTags('Appointments')
@ApiErrors()
@Controller('appointments')
export class AppointmentsController {
  constructor(@Inject(BookingService) private booking: BookingService, @Inject(AppointmentsService) private service: AppointmentsService, @Inject(Metrics) private metrics: Metrics) {}
  @Post()
  @ApiOperation({ summary: 'Book a qualified technician and service bay atomically', description: 'Idempotency keys are global in this demo. Identical normalized retries return 200 with Idempotency-Replayed: true; changed payloads return 409. No key means an independent booking.' })
  @ApiJsonBody(Booking, swaggerDemo.booking)
  @ApiHeader({ name: 'Idempotency-Key', required: false, schema: { ...Key, default: swaggerDemo.idempotencyKey }, description: 'Prefilled demo key: first request returns 201, identical retries return 200. Use a new key when changing the body.' })
  @ApiJsonResponse({ status: 201, schema: Appointment })
  @ApiJsonResponse({ status: 200, schema: Appointment })
  @ApiJsonResponse({ status: 400, schema: errors[400] })
  @ApiJsonResponse({ status: 404, schema: errors[404] })
  @ApiJsonResponse({ status: 409, schema: errors[409] })
  @ApiJsonResponse({ status: 422, schema: errors[422] })
  async create(@Body(new SchemaPipe(Booking)) body: CreateAppointmentDto, @Headers('idempotency-key') key: string | undefined, @Res({ passthrough: true }) reply: FastifyReply) {
    if (key !== undefined) new SchemaPipe(Key).transform(key);
    const result = await this.booking.book(body, key);
    this.metrics.bookings.labels(result.replayed ? 'replayed' : 'confirmed').inc();
    reply.code(result.replayed ? 200 : 201).header('location', `/appointments/${result.appointment.id}`);
    if (result.replayed) reply.header('idempotency-replayed', 'true');
    return result.appointment;
  }
  @Get(':id')
  @ApiOperation({ summary: 'Get a confirmed appointment and assigned resources' })
  @ApiParam({ name: 'id', schema: { ...UUID, default: swaggerDemo.appointmentId }, description: 'Existing seeded appointment; replace with a POST response id to retrieve a new booking' })
  @ApiJsonResponse({ status: 200, schema: Appointment })
  @ApiJsonResponse({ status: 404, schema: errors[404] })
  get(@Param('id', new SchemaPipe(UUID)) id: string) { return this.service.get(id); }
  @Get()
  @ApiOperation({ summary: 'List appointments by UTC start date with bounded pagination', description: 'Unauthenticated assessment demo. Production requires object-level authorization.' })
  @ApiQuery({ name: 'dealershipId', required: false, schema: { ...UUID, default: swaggerDemo.dealershipId } })
  @ApiQuery({ name: 'customerId', required: false, schema: { ...UUID, default: swaggerDemo.customerId } })
  @ApiQuery({ name: 'date', required: false, schema: { type: 'string', format: 'date', default: swaggerDemo.date } })
  @ApiQuery({ name: 'status', required: false, schema: { type: 'string', enum: ['confirmed'], default: 'confirmed' } })
  @ApiQuery({ name: 'limit', required: false, schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 } })
  @ApiQuery({ name: 'offset', required: false, schema: { type: 'integer', minimum: 0, maximum: 10000, default: 0 } })
  @ApiJsonResponse({ status: 200, schema: Type.Object({ items: Type.Array(Appointment), limit: Type.Integer(), offset: Type.Integer(), hasMore: Type.Boolean() }) })
  list(@Query(new SchemaPipe(ListQuery)) query: ListFilters) { return this.service.list(query); }
}
