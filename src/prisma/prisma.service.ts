import 'reflect-metadata';
import { Inject, Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';
import type { PoolConfig } from 'pg';
export const PRISMA_OPTIONS = Symbol('PRISMA_OPTIONS');
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(@Inject(PRISMA_OPTIONS) options: PoolConfig) {
    super({ adapter: new PrismaPg({ max: 10, connectionTimeoutMillis: 5000, statement_timeout: 5000, query_timeout: 6000, ...options }) });
  }
  async onModuleInit() { await this.$connect(); }
  async onModuleDestroy() { await this.$disconnect(); }
}
