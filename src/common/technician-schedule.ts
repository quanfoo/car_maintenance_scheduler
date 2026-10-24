import 'reflect-metadata';
import { Injectable } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client.js';
/** Shared protocol for booking, admin mutations and seed writes. */
@Injectable()
export class TechnicianSchedule {
  async lock(tx: Prisma.TransactionClient, technicianId: string) {
    const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM technicians WHERE id=${technicianId}::uuid FOR UPDATE`;
    return rows.length > 0;
  }
  async conflicts(tx: Prisma.TransactionClient, technicianId: string, start: Date, end: Date) {
    // Must be invoked in a NEW statement after locking; READ COMMITTED then sees
    // a prior lock holder's committed writes, even if we started earlier.
    const appointments = await tx.appointment.count({ where: { technicianId, status: 'confirmed', startTime: { lt: end }, endTime: { gt: start } } });
    const timeOff = await tx.technicianTimeOff.count({ where: { technicianId, startsAt: { lt: end }, endsAt: { gt: start } } });
    return { appointments, timeOff };
  }
}
