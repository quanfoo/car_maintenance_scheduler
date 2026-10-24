import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service.js';
import { TechnicianSchedule } from '../../common/technician-schedule.js';
import { databaseError, isRetryable } from '../../common/database-errors.js';
import { ApiError } from '../../errors.js';
import type { CreateTimeOffDto } from './time-off.dto.js';
const MAX_ATTEMPTS = 5;
@Injectable()
export class TimeOffService {
  constructor(@Inject(PrismaService) private prisma: PrismaService, @Inject(TechnicianSchedule) private schedule: TechnicianSchedule) {}
  async list(technicianId: string) {
    if (!await this.prisma.technician.findUnique({ where: { id: technicianId }, select: { id: true } })) throw this.unknownTechnician();
    return this.prisma.technicianTimeOff.findMany({ where: { technicianId }, orderBy: [{ startsAt: 'asc' }, { id: 'asc' }] });
  }
  async create(technicianId: string, input: CreateTimeOffDto) {
    const start = new Date(input.startsAt);
    const end = new Date(input.endsAt);
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start >= end) throw new ApiError(400, 'INVALID_INTERVAL', 'startsAt must be before endsAt');
    for (let attempt=0; attempt<MAX_ATTEMPTS; attempt++) {
      try {
        return await this.prisma.$transaction(async tx => {
          await tx.$executeRaw`SET LOCAL statement_timeout='5s'`;
          await tx.$executeRaw`SET LOCAL lock_timeout='3s'`;
          if (!await this.schedule.lock(tx, technicianId)) throw this.unknownTechnician();
          const conflicts = await this.schedule.conflicts(tx, technicianId, start, end);
          if (conflicts.appointments) throw new ApiError(409, 'APPOINTMENT_CONFLICT', 'Time off overlaps a confirmed appointment');
          if (conflicts.timeOff) throw this.overlap();
          return tx.technicianTimeOff.create({ data: { id: randomUUID(), technicianId, startsAt: start, endsAt: end, reason: input.reason ?? null } });
        }, { isolationLevel: 'ReadCommitted', maxWait: 5000, timeout: 15000 });
      } catch (error) {
        if (databaseError(error).code === '23P01') throw this.overlap();
        if (isRetryable(error)) continue;
        throw error;
      }
    }
    throw new ApiError(409, 'SCHEDULING_CONTENTION', 'Technician schedule was contended; refresh and retry');
  }
  async delete(technicianId: string, id: string) {
    for (let attempt=0; attempt<MAX_ATTEMPTS; attempt++) {
      try {
        await this.prisma.$transaction(async tx => {
          await tx.$executeRaw`SET LOCAL lock_timeout='3s'`;
          if (!await this.schedule.lock(tx, technicianId)) throw this.unknownTechnician();
          const deleted = await tx.technicianTimeOff.deleteMany({ where: { id, technicianId } });
          if (!deleted.count) throw new ApiError(404, 'TIME_OFF_NOT_FOUND', 'Time off not found for this technician');
        }, { isolationLevel: 'ReadCommitted', maxWait: 5000, timeout: 15000 });
        return;
      } catch (error) { if (isRetryable(error)) continue; throw error; }
    }
    throw new ApiError(409, 'SCHEDULING_CONTENTION', 'Technician schedule was contended; refresh and retry');
  }
  private unknownTechnician() { return new ApiError(404, 'TECHNICIAN_NOT_FOUND', 'Technician not found'); }
  private overlap() { return new ApiError(409, 'TIME_OFF_CONFLICT', 'Time off overlaps another time-off interval'); }
}
