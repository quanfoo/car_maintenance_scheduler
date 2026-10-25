import { ApiJsonResponse, ApiErrors } from '../../common/openapi.js';
import { Controller, Get, Global, Inject, Module, Res } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Type } from '@sinclair/typebox';
import type { FastifyReply } from 'fastify';
import { PrismaService } from '../../prisma/prisma.service.js';
import { Metrics } from '../../common/metrics.js';
import { ApiError } from '../../errors.js';
@ApiTags('Operations')
@ApiErrors()
@Controller()
class OperationsController {
  constructor(@Inject(PrismaService) private prisma: PrismaService, @Inject(Metrics) private metrics: Metrics) {}
  @Get('health/live')
  @ApiJsonResponse({ status: 200, schema: Type.Object({ status: Type.String() }) })
  live() { return { status: 'ok' }; }
  @Get('health/ready')
  @ApiJsonResponse({ status: 200, schema: Type.Object({ status: Type.String() }) })
  async ready() {
    try { await this.prisma.appointment.findFirst({ select: { id: true } }); }
    catch { throw new ApiError(503, 'DATABASE_UNAVAILABLE', 'Database or schema unavailable'); }
    return { status: 'ready' };
  }
  @Get('metrics')
  @ApiOperation({ summary: 'View Prometheus metrics', description: 'Request latency, booking outcomes, allocation retries and database errors. Execute other API requests, then refresh to see updated values.' })
  @ApiResponse({ status: 200, description: 'Prometheus text exposition format', content: {
    'text/plain': { schema: { type: 'string' }, example: '# HELP scheduler_booking_total Booking outcomes (replays counted separately)\n# TYPE scheduler_booking_total counter\nscheduler_booking_total{outcome="confirmed"} 1\n' },
  } })
  async metricsResponse(@Res({ passthrough: true }) reply: FastifyReply) {
    reply.type(this.metrics.registry.contentType);
    return this.metrics.registry.metrics();
  }
}
@Global()
@Module({ controllers: [OperationsController], providers: [Metrics], exports: [Metrics] })
export class OperationsModule {}
