import { Catch, HttpException, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { ApiError } from '../errors.js';
import { databaseError } from './database-errors.js';
import { Metrics } from './metrics.js';
@Catch()
export class ApiFilter implements ExceptionFilter {
  constructor(private metrics: Metrics) {}
  catch(error: unknown, host: ArgumentsHost) {
    const request = host.switchToHttp().getRequest<FastifyRequest>();
    const reply = host.switchToHttp().getResponse<FastifyReply>();
    const db = databaseError(error);
    const unavailable = ['ECONNREFUSED','ECONNRESET','57P01','53300','57014','DATABASE_UNAVAILABLE'].includes(db.code ?? '');
    const raw = error as { statusCode?: number; name?: string };
    const httpStatus = error instanceof HttpException ? error.getStatus() : raw.statusCode;
    const status = error instanceof ApiError ? error.statusCode : httpStatus && httpStatus >= 400 && httpStatus < 500 ? httpStatus : unavailable ? 503 : 500;
    const code = error instanceof ApiError ? error.code : status === 404 ? 'NOT_FOUND' : status < 500 ? 'BAD_REQUEST' : unavailable ? 'DATABASE_UNAVAILABLE' : 'INTERNAL_ERROR';
    const message = error instanceof ApiError ? error.message : status === 404 ? 'Route not found' : status < 500 ? 'Request could not be parsed or accepted' : unavailable ? 'Database temporarily unavailable' : 'Unexpected server error';
    if (request.routeOptions.url === '/appointments' && request.method === 'POST') this.metrics.bookings.labels(status === 409 ? 'conflict' : 'error').inc();
    if (status >= 500) {
      this.metrics.dbErrors.labels(db.code ?? 'unknown').inc();
      request.log.error({ errorCode: db.code, constraint: db.constraint, errorName: raw.name }, 'Request failed');
    }
    reply.code(status).send({ error: { code, message, requestId: request.id } });
  }
}
