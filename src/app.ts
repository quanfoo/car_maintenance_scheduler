import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module.js';
import { PrismaService } from './prisma/prisma.service.js';
import { Metrics } from './common/metrics.js';
import { ApiFilter } from './common/api.filter.js';
import type { FastifyInstance, FastifyRequest } from 'fastify';

export async function buildApp(prisma: PrismaService, options: { logger?: boolean } = {}) {
  const adapter = new FastifyAdapter({
    bodyLimit: 16 * 1024, genReqId: () => randomUUID(),
    logger: options.logger === false ? false : {
      level: process.env.LOG_LEVEL ?? 'info',
      redact: ['req.headers.authorization','req.headers.cookie','req.headers.idempotency-key'],
      serializers: { req: (req: FastifyRequest) => ({ method: req.method, url: req.url?.split('?')[0], hostname: req.hostname }) },
    },
  });
  const app = await NestFactory.create<NestFastifyApplication>(AppModule.forClient(prisma), adapter, { logger: false });
  const fastify = adapter.getInstance() as unknown as FastifyInstance;
  const metrics = app.get(Metrics);
  fastify.addHook('onRequest', async (request, reply) => { reply.header('x-request-id', request.id); });
  fastify.addHook('onResponse', async (request, reply) => {
    metrics.requests.labels(request.method, request.routeOptions.url ?? 'unmatched', String(reply.statusCode)).observe(reply.elapsedTime / 1000);
  });
  app.useGlobalFilters(new ApiFilter(metrics));
  const document = SwaggerModule.createDocument(app, new DocumentBuilder().setTitle('Unified Service Scheduler').setVersion('1.0.0').setDescription('Unauthenticated assessment demo. Dates are UTC. Availability is advisory; booking is authoritative.').build());
  SwaggerModule.setup('docs', app, document, { jsonDocumentUrl: 'openapi.json' });
  await app.init();
  await fastify.ready();
  return app;
}
