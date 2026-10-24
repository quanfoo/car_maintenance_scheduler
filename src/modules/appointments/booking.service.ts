import { TechnicianSchedule } from '../../common/technician-schedule.js';
import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { ServiceTypesService } from '../service-types/service-types.service.js';
import { Metrics } from '../../common/metrics.js';
import { databaseError, isRetryable } from '../../common/database-errors.js';
import { ApiError } from '../../errors.js';
import { appointmentEnd, canonicalBooking, fingerprint, type BookingInput } from '../../booking/domain.js';
import { AllocationQueries } from './allocation.queries.js';
import { publicAppointment } from './appointment.mapper.js';
class AllocationChanged extends Error {}
export const MAX_ALLOCATION_ATTEMPTS = 5;
@Injectable()
export class BookingService {
  constructor(
    @Inject(PrismaService) private prisma: PrismaService,
    @Inject(ServiceTypesService) private services: ServiceTypesService,
    @Inject(AllocationQueries) private allocation: AllocationQueries,
    @Inject(Metrics) private metrics: Metrics,
    @Inject(TechnicianSchedule) private schedule: TechnicianSchedule,
  ) {}
  private async replay(db: Prisma.TransactionClient, key: string | undefined, hash: string) {
    if (!key) return;
    const a = await db.appointment.findUnique({ where: { idempotencyKey: key } });
    if (!a) return;
    if (a.requestFingerprint !== hash) throw new ApiError(409, 'IDEMPOTENCY_KEY_REUSED', 'Idempotency-Key was used with a different request');
    return { appointment: publicAppointment(a), replayed: true };
  }
  async book(raw: BookingInput, key?: string) {
    const input = canonicalBooking(raw);
    const hash = fingerprint(input);
    for (let attempt = 0; attempt < MAX_ALLOCATION_ATTEMPTS; attempt++) {
      try {
        return await this.prisma.$transaction(async tx => {
          await tx.$executeRaw`SET LOCAL statement_timeout='5s'`;
          await tx.$executeRaw`SET LOCAL lock_timeout='3s'`;
          if (key) {
            await tx.$executeRaw`INSERT INTO booking_keys(key) VALUES (${key}) ON CONFLICT DO NOTHING`;
            await tx.$queryRaw`SELECT key FROM booking_keys WHERE key=${key} FOR UPDATE`;
          }
          const replay = await this.replay(tx, key, hash);
          if (replay) return replay;
          const service = await this.services.offered(input.dealershipId, input.serviceTypeId, tx);
          if (!await tx.customer.findUnique({ where: { id: input.customerId }, select: { id: true } })) throw new ApiError(404, 'CUSTOMER_NOT_FOUND', 'Customer not found');
          const vehicle = await tx.vehicle.findUnique({ where: { id: input.vehicleId }, select: { customerId: true } });
          if (!vehicle) throw new ApiError(404, 'VEHICLE_NOT_FOUND', 'Vehicle not found');
          if (vehicle.customerId !== input.customerId) throw new ApiError(422, 'VEHICLE_OWNERSHIP_MISMATCH', 'Vehicle does not belong to customer');
          const start = new Date(input.startTime);
          const end = new Date(appointmentEnd(input.startTime, service.durationMinutes));
          const technicianId = await this.allocation.lockTechnician(tx, input.dealershipId, input.serviceTypeId, start, end);
          if (!technicianId) throw this.noCapacity();
          // Fresh statement AFTER locking: important for future cross-table scheduling.
          const conflicts = await this.schedule.conflicts(tx, technicianId, start, end);
          if (conflicts.appointments || conflicts.timeOff) throw new AllocationChanged();
          const serviceBayId = await this.allocation.lockBay(tx, input.dealershipId, start, end);
          if (!serviceBayId) throw this.noCapacity();
          const appointment = await tx.appointment.create({ data: {
            id: randomUUID(), customerId: input.customerId, vehicleId: input.vehicleId,
            dealershipId: input.dealershipId, serviceTypeId: input.serviceTypeId,
            technicianId, serviceBayId, startTime: start, endTime: end, durationMinutes: service.durationMinutes,
            idempotencyKey: key ?? null, requestFingerprint: key ? hash : null,
          } });
          return { appointment: publicAppointment(appointment), replayed: false };
        }, { isolationLevel: 'ReadCommitted', maxWait: 5000, timeout: 15000 });
      } catch (error) {
        const dbError = databaseError(error);
        // Interactive transaction has already rolled back before any recovery read.
        if (dbError.code === '23505') { const replay = await this.replay(this.prisma, key, hash); if (replay) return replay; }
        if (error instanceof AllocationChanged || isRetryable(error)) { this.metrics.retries.inc(); continue; }
        if (dbError.code === '23503') throw new ApiError(409, 'REFERENCE_CHANGED', 'A referenced record changed; refresh and retry');
        throw error;
      }
    }
    throw new ApiError(409, 'ALLOCATION_CONTENTION', 'Resource allocation was contended; retry with the same idempotency key');
  }
  private noCapacity() { return new ApiError(409, 'NO_CAPACITY', 'No resource pair is currently allocatable for the full interval; refresh or retry'); }
}
