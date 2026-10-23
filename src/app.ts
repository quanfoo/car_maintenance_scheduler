import Fastify from 'fastify';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { Type, type Static } from '@sinclair/typebox';
import { Registry, Counter, Histogram } from 'prom-client';
import type { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import { ApiError } from './errors.js';
import { BookingService, availability, appointmentColumns, type Appointment as AppointmentRow } from './booking/service.js';
import { utcDay } from './booking/domain.js';
import { UUID, Timestamp, Booking, Appointment, AvailabilityQuery, ListQuery, errors } from './schemas.js';
import type { PgError } from './db/index.js';

export async function buildApp(pool: Pool, options: { logger?: boolean } = {}) {
  const app = Fastify({
    logger: options.logger === false ? false : {
      level: process.env.LOG_LEVEL ?? 'info',
      redact: ['req.headers.authorization', 'req.headers.cookie', 'req.headers.idempotency-key'],
      serializers: { req: req => ({ method: req.method, url: req.url?.split('?')[0], hostname: req.hostname }) },
    },
    genReqId: () => randomUUID(),
    bodyLimit: 16 * 1024,
    ajv: { customOptions: { removeAdditional: false } },
  });
  const registry = new Registry();
  const requests = new Histogram({ name: 'scheduler_http_request_duration_seconds', help: 'HTTP request latency', labelNames: ['method', 'route', 'status'], registers: [registry], buckets: [0.005,0.01,0.025,0.05,0.1,0.5,1,5] });
  const outcomes = new Counter({ name: 'scheduler_booking_total', help: 'Booking outcomes (replays counted separately)', labelNames: ['outcome'], registers: [registry] });
  const retries = new Counter({ name: 'scheduler_allocation_retries_total', help: 'Retryable resource allocation failures', registers: [registry] });
  const dbErrors = new Counter({ name: 'scheduler_database_errors_total', help: 'Unhandled database failures', labelNames: ['code'], registers: [registry] });
  const booking = new BookingService(pool, () => retries.inc());
  app.addHook('onRequest', async (_request, reply) => { reply.header('x-request-id', _request.id); });
  app.addHook('onResponse', async (request, reply) => {
    requests.labels(request.method, request.routeOptions.url ?? 'unmatched', String(reply.statusCode)).observe(reply.elapsedTime / 1000);
  });
  app.setErrorHandler((error, request, reply) => {
    const e = error as PgError & { validation?: unknown; statusCode?: number };
    const unavailable = ['ECONNREFUSED','ECONNRESET','57P01','53300','57014'].includes(e.code ?? '');
    const known = e instanceof ApiError;
    const clientError = !known && e.statusCode !== undefined && e.statusCode >= 400 && e.statusCode < 500;
    const status = known ? e.statusCode : clientError ? e.statusCode! : unavailable ? 503 : 500;
    const code = known ? e.code : e.validation ? 'VALIDATION_ERROR' : clientError ? 'BAD_REQUEST' : unavailable ? 'DATABASE_UNAVAILABLE' : 'INTERNAL_ERROR';
    const message = known ? e.message : e.validation ? 'Request does not match the API schema' : clientError ? 'Request could not be parsed or accepted' : unavailable ? 'Database temporarily unavailable' : 'Unexpected server error';
    if (request.routeOptions.url === '/appointments' && request.method === 'POST') outcomes.labels(status === 409 ? 'conflict' : 'error').inc();
    if (status >= 500) {
      dbErrors.labels(e.code ?? 'unknown').inc();
      // SQL error details may contain customer identifiers; log code and constraint only.
      request.log.error({ errorCode: e.code, constraint: e.constraint, errorName: e.name }, 'Request failed');
    }
    reply.code(status).send({ error: { code, message, requestId: request.id } });
  });
  app.setNotFoundHandler((request, reply) => reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Route not found', requestId: request.id } }));
  await app.register(swagger, { openapi: {
    info: { title: 'Unified Service Scheduler', version: '1.0.0', description: 'Unauthenticated assessment demo. All dates are UTC. Availability is advisory; booking is authoritative.' },
    tags: [{ name: 'Catalog' }, { name: 'Appointments' }, { name: 'Availability' }, { name: 'Operations' }],
  } });
  await app.register(swaggerUi, { routePrefix: '/docs' });
  app.get('/openapi.json', { schema: { hide: true } }, async () => app.swagger());
  const health = Type.Object({ status: Type.String() });
  app.get('/health/live', { schema: { tags: ['Operations'], response: { 200: health } } }, async () => ({ status: 'ok' }));
  app.get('/health/ready', { schema: { tags: ['Operations'], response: { 200: health, ...errors } } }, async () => {
    try {
      // Both connection and expected schema must be usable, with a bounded probe.
      await pool.query('SELECT id FROM appointments LIMIT 0');
    } catch { throw new ApiError(503, 'DATABASE_UNAVAILABLE', 'Database or schema unavailable'); }
    return { status: 'ready' };
  });
  app.get('/metrics', { schema: { hide: true } }, async (_request, reply) => {
    reply.type(registry.contentType);
    return registry.metrics();
  });
  app.get('/dealerships', { schema: { tags: ['Catalog'], summary: 'List dealerships', response: { 200: Type.Array(Type.Object({ id: UUID, name: Type.String() })), ...errors } } }, async () => {
    return (await pool.query('SELECT id,name FROM dealerships ORDER BY id')).rows;
  });
  app.get<{ Params: { dealershipId: string } }>('/dealerships/:dealershipId/service-types', { schema: {
    tags: ['Catalog'], summary: 'Services offered at a dealership', params: Type.Object({ dealershipId: UUID }),
    response: { 200: Type.Array(Type.Object({ id: UUID, name: Type.String(), durationMinutes: Type.Integer() })), ...errors },
  } }, async (request) => {
    const { dealershipId } = request.params;
    if (!(await pool.query('SELECT id FROM dealerships WHERE id=$1', [dealershipId])).rowCount) throw new ApiError(404, 'DEALERSHIP_NOT_FOUND', 'Dealership not found');
    return (await pool.query(`SELECT s.id,s.name,s.duration_minutes AS "durationMinutes" FROM service_types s
      JOIN dealership_services ds ON ds.service_type_id=s.id WHERE ds.dealership_id=$1 ORDER BY s.duration_minutes,s.id`, [dealershipId])).rows;
  });
  app.get<{ Querystring: Static<typeof AvailabilityQuery> }>('/availability', { schema: {
    tags: ['Availability'], summary: '48 half-hour starts on a UTC date; bookings may finish next day',
    description: 'A slot is available when at least one qualified technician and one bay can cover the entire service interval. This is advisory and does not reserve resources.',
    querystring: AvailabilityQuery, response: { 200: Type.Object({ dealershipId: UUID, serviceTypeId: UUID, date: Type.String(), timezone: Type.Literal('UTC'), intervalMinutes: Type.Literal(30), durationMinutes: Type.Integer(), advisory: Type.Literal(true), slots: Type.Array(Type.Object({ startTime: Timestamp, endTime: Timestamp, available: Type.Boolean() })) }), ...errors },
  } }, async request => availability(pool, request.query.dealershipId, request.query.serviceTypeId, request.query.date));
  app.post<{ Body: Static<typeof Booking>; Headers: { 'idempotency-key'?: string } }>('/appointments', { schema: {
    tags: ['Appointments'], summary: 'Book a qualified technician and service bay atomically', body: Booking,
    description: 'Optional Idempotency-Key is globally unique in this demo and retained with the appointment. Identical retries return 200 and Idempotency-Replayed: true. Reusing a key for a different normalized request returns 409. Without a key, each request is a new booking.',
    headers: Type.Object({ 'idempotency-key': Type.Optional(Type.String({ minLength: 1, maxLength: 128, pattern: '^[A-Za-z0-9._:-]+$' })) }),
    response: { 200: Appointment, 201: Appointment, ...errors },
  } }, async (request, reply) => {
    const result = await booking.book(request.body, request.headers['idempotency-key']);
    outcomes.labels(result.replayed ? 'replayed' : 'confirmed').inc();
    reply.header('location', `/appointments/${result.appointment.id}`);
    if (result.replayed) reply.header('idempotency-replayed', 'true');
    return reply.code(result.replayed ? 200 : 201).send(result.appointment);
  });
  app.get<{ Params: { id: string } }>('/appointments/:id', { schema: { tags: ['Appointments'], summary: 'Get a confirmed appointment and assigned resource IDs', params: Type.Object({ id: UUID }), response: { 200: Appointment, ...errors } } }, async request => {
    const result = await pool.query<AppointmentRow>(`SELECT ${appointmentColumns} FROM appointments WHERE id=$1`, [request.params.id]);
    if (!result.rows[0]) throw new ApiError(404, 'APPOINTMENT_NOT_FOUND', 'Appointment not found');
    return result.rows[0];
  });
  app.get<{ Querystring: Static<typeof ListQuery> }>('/appointments', { schema: {
    tags: ['Appointments'], summary: 'List appointments by start date (UTC) with bounded pagination',
    description: 'Unauthenticated demo only. Production requires authorization. Date selects the start date, not all overlapping appointments. Results sort by startTime, id.',
    querystring: ListQuery, response: { 200: Type.Object({ items: Type.Array(Appointment), limit: Type.Integer(), offset: Type.Integer(), hasMore: Type.Boolean() }), ...errors },
  } }, async request => {
    const { dealershipId, customerId, date, status, limit = 20, offset = 0 } = request.query;
    const values: (string | number)[] = [];
    const clauses: string[] = [];
    const add = (column: string, value: string, operator = '=') => { values.push(value); clauses.push(`${column} ${operator} $${values.length}`); };
    if (dealershipId) add('dealership_id', dealershipId);
    if (customerId) add('customer_id', customerId);
    if (status) add('status', status);
    if (date) { const day = utcDay(date); add('start_time', day.start, '>='); add('start_time', day.end, '<'); }
    values.push(limit + 1, offset);
    const result = await pool.query<AppointmentRow>(`SELECT ${appointmentColumns} FROM appointments ${clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''} ORDER BY start_time,id LIMIT $${values.length - 1} OFFSET $${values.length}`, values);
    return { items: result.rows.slice(0, limit), limit, offset, hasMore: result.rows.length > limit };
  });
  return app;
}
