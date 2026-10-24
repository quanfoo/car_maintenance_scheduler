import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ServiceTypesService } from '../service-types/service-types.service.js';
import { appointmentEnd, utcDay } from '../../booking/domain.js';
@Injectable()
export class AvailabilityService {
  constructor(@Inject(PrismaService) private prisma: PrismaService, @Inject(ServiceTypesService) private services: ServiceTypesService) {}
  async get(dealershipId: string, serviceTypeId: string, date: string) {
    const day = utcDay(date);
    return this.prisma.$transaction(async tx => {
      const { durationMinutes } = await this.services.offered(dealershipId, serviceTypeId, tx);
      const window = { startTime: { lt: new Date(appointmentEnd(day.end, durationMinutes)) }, endTime: { gt: new Date(day.start) }, status: 'confirmed' };
      const technicians = await tx.technician.findMany({ where: { dealershipId, skills: { some: { serviceTypeId } } }, select: { appointments: { where: window, select: { startTime: true, endTime: true } }, timeOff: { where: { startsAt: window.startTime, endsAt: window.endTime }, select: { startsAt: true, endsAt: true } } } });
      const bays = await tx.serviceBay.findMany({ where: { dealershipId }, select: { appointments: { where: window, select: { startTime: true, endTime: true } } } });
      const free = (appointments: { startTime: Date; endTime: Date }[], start: Date, end: Date) => !appointments.some(a => a.startTime < end && a.endTime > start);
      const slots = Array.from({ length: 48 }, (_, i) => {
        const startTime = new Date(appointmentEnd(day.start, i * 30));
        const endTime = new Date(appointmentEnd(startTime.toISOString(), durationMinutes));
        return { startTime, endTime, available: technicians.some(t => free(t.appointments, startTime, endTime) && !t.timeOff.some(leave => leave.startsAt < endTime && leave.endsAt > startTime)) && bays.some(b => free(b.appointments, startTime, endTime)) };
      });
      return { dealershipId, serviceTypeId, date, timezone: 'UTC', intervalMinutes: 30, durationMinutes, advisory: true, slots };
    }, { isolationLevel: 'RepeatableRead', maxWait: 5000, timeout: 15000 });
  }
}
