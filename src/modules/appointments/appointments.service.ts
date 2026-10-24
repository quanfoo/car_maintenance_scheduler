import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ApiError } from '../../errors.js';
import { utcDay } from '../../booking/domain.js';
import type { ListFilters } from '../../schemas.js';
import { publicAppointment } from './appointment.mapper.js';
@Injectable()
export class AppointmentsService {
  constructor(@Inject(PrismaService) private prisma: PrismaService) {}
  async get(id: string) {
    const appointment = await this.prisma.appointment.findUnique({ where: { id } });
    if (!appointment) throw new ApiError(404, 'APPOINTMENT_NOT_FOUND', 'Appointment not found');
    return publicAppointment(appointment);
  }
  async list({ dealershipId, customerId, date, status, limit = 20, offset = 0 }: ListFilters) {
    const day = date ? utcDay(date) : undefined;
    const rows = await this.prisma.appointment.findMany({
      where: { dealershipId, customerId, status, startTime: day ? { gte: new Date(day.start), lt: new Date(day.end) } : undefined },
      orderBy: [{ startTime: 'asc' }, { id: 'asc' }], take: limit + 1, skip: offset,
    });
    return { items: rows.slice(0, limit).map(publicAppointment), limit, offset, hasMore: rows.length > limit };
  }
}
