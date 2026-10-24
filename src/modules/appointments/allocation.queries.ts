import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
/** SQL is limited to ordered resource row locks; Prisma owns subsequent reads/writes. */
@Injectable()
export class AllocationQueries {
  async lockTechnician(tx: Prisma.TransactionClient, dealershipId: string, serviceTypeId: string, start: Date, end: Date) {
    const rows = await tx.$queryRaw<{ id: string }[]>`SELECT t.id FROM technicians t
      JOIN technician_skills sk ON sk.technician_id=t.id
      WHERE t.dealership_id=${dealershipId}::uuid AND sk.service_type_id=${serviceTypeId}::uuid
      AND NOT EXISTS (SELECT 1 FROM appointments a WHERE a.technician_id=t.id AND a.status='confirmed'
        AND a.start_time < ${end} AND a.end_time > ${start})
      ORDER BY t.id LIMIT 1 FOR UPDATE OF t SKIP LOCKED`;
    return rows[0]?.id;
  }
  async lockBay(tx: Prisma.TransactionClient, dealershipId: string, start: Date, end: Date) {
    const rows = await tx.$queryRaw<{ id: string }[]>`SELECT b.id FROM service_bays b
      WHERE b.dealership_id=${dealershipId}::uuid AND NOT EXISTS (
        SELECT 1 FROM appointments a WHERE a.service_bay_id=b.id AND a.status='confirmed'
        AND a.start_time < ${end} AND a.end_time > ${start})
      ORDER BY b.id LIMIT 1 FOR UPDATE OF b SKIP LOCKED`;
    return rows[0]?.id;
  }
}
