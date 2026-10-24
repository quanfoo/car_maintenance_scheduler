import { TechnicianSchedule } from '../common/technician-schedule.js';
import { ApiError } from '../errors.js';
import type { PrismaService } from '../prisma/prisma.service.js';
export const ids = {
  north: '10000000-0000-4000-8000-000000000001',
  south: '10000000-0000-4000-8000-000000000002',
  alice: '20000000-0000-4000-8000-000000000001',
  bob: '20000000-0000-4000-8000-000000000002',
  aliceCar: '30000000-0000-4000-8000-000000000001',
  bobCar: '30000000-0000-4000-8000-000000000002',
  oil: '40000000-0000-4000-8000-000000000001',
  tyres: '40000000-0000-4000-8000-000000000002',
  major: '40000000-0000-4000-8000-000000000003',
};
export const tech = (n: number) => `50000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
export const bay = (n: number) => `60000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
export const seededAppointment = (n: number) => `70000000-0000-4000-8000-${String(n).padStart(12, '0')}`;


/** Add deterministic records with Prisma; never reset user data. */
export async function seed(prisma: PrismaService) {
  await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(1739028143)::text`;
    for (const [id, name] of [[ids.north,'North Motors'],[ids.south,'South Motors']]) await tx.dealership.upsert({ where: { id: id! }, create: { id: id!, name: name! }, update: {} });
    for (const [id, name] of [[ids.alice,'Alice Demo'],[ids.bob,'Bob Demo']]) await tx.customer.upsert({ where: { id: id! }, create: { id: id!, name: name! }, update: {} });
    for (const [id, customerId, vin] of [[ids.aliceCar,ids.alice,'DEMO0000000000001'],[ids.bobCar,ids.bob,'DEMO0000000000002']]) await tx.vehicle.upsert({ where: { id: id! }, create: { id: id!, customerId: customerId!, vin: vin! }, update: {} });
    for (const [id, name, durationMinutes] of [[ids.oil,'Oil change',30],[ids.tyres,'Tyre service',60],[ids.major,'Major service',90]] as const) await tx.serviceType.upsert({ where: { id }, create: { id, name, durationMinutes }, update: {} });
    for (const dealershipId of [ids.north,ids.south]) for (const serviceTypeId of [ids.oil,ids.tyres,ids.major]) await tx.dealershipService.upsert({ where: { dealershipId_serviceTypeId: { dealershipId, serviceTypeId } }, create: { dealershipId, serviceTypeId }, update: {} });
    for (let n=1;n<=5;n++) {
      await tx.technician.upsert({ where: { id: tech(n) }, create: { id: tech(n), dealershipId: n<=3?ids.north:ids.south, name: `Technician ${n}` }, update: {} });
      const skills = n===1?[ids.oil,ids.tyres,ids.major]:n===2?[ids.oil,ids.tyres]:n===3?[ids.major]:n===4?[ids.oil,ids.major]:[ids.tyres];
      for (const serviceTypeId of skills) await tx.technicianSkill.upsert({ where: { technicianId_serviceTypeId: { technicianId: tech(n), serviceTypeId } }, create: { technicianId: tech(n), serviceTypeId }, update: {} });
    }
    for (let n=1;n<=3;n++) await tx.serviceBay.upsert({ where: { id: bay(n) }, create: { id: bay(n), dealershipId: n<=2?ids.north:ids.south, name: `Bay ${n}` }, update: {} });
    const appointments: [number,number,string,string][] = [
      [1,1,ids.oil,'09:00'],[2,2,ids.oil,'09:00'],[1,1,ids.tyres,'10:00'],[2,2,ids.oil,'10:30'],
      [3,1,ids.major,'11:00'],[2,2,ids.tyres,'11:00'],[1,2,ids.oil,'13:00'],[3,1,ids.major,'14:00'],
      [4,3,ids.oil,'09:00'],[5,3,ids.tyres,'10:00'],
    ];
    for (const [i,[t,b,serviceTypeId,time]] of appointments.entries()) {
      const durationMinutes = serviceTypeId===ids.oil?30:serviceTypeId===ids.tyres?60:90;
      const startTime = new Date(`2030-01-15T${time}:00Z`);
      await tx.appointment.upsert({ where: { id: seededAppointment(i+1) }, create: {
        id: seededAppointment(i+1), customerId: ids.alice, vehicleId: ids.aliceCar, dealershipId: t<=3?ids.north:ids.south,
        serviceTypeId, technicianId: tech(t), serviceBayId: bay(b), startTime,
        endTime: new Date(startTime.getTime()+durationMinutes*60000), durationMinutes,
      }, update: {} });
    }
    const schedule = new TechnicianSchedule();
    const leaves = [
      { id: '80000000-0000-4000-8000-000000000001', technicianId: tech(1), startsAt: new Date('2030-01-17T00:00:00Z'), endsAt: new Date('2030-01-18T00:00:00Z'), reason: 'Demo full-day leave' },
      { id: '80000000-0000-4000-8000-000000000002', technicianId: tech(2), startsAt: new Date('2030-01-17T09:00:00Z'), endsAt: new Date('2030-01-17T12:00:00Z'), reason: 'Demo morning training' },
    ];
    for (const leave of leaves) {
      await schedule.lock(tx, leave.technicianId);
      if (await tx.technicianTimeOff.findUnique({ where: { id: leave.id } })) continue;
      const conflict = await schedule.conflicts(tx, leave.technicianId, leave.startsAt, leave.endsAt);
      if (conflict.appointments || conflict.timeOff) throw new ApiError(409, 'SEED_CONFLICT', 'Demo time off conflicts with an existing schedule');
      await tx.technicianTimeOff.create({ data: leave });
    }
  }, { timeout: 15000 });
}
