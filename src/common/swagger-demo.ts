import { ids, tech, seededAppointment, seededTimeOff } from '../db/seed-data.js';
/** Documentation examples only: do not use these values as API validation defaults. */
export const swaggerDemo = {
  dealershipId: ids.north,
  serviceTypeId: ids.oil,
  customerId: ids.alice,
  date: '2030-01-15',
  appointmentId: seededAppointment(1),
  technicianId: tech(2),
  timeOffId: seededTimeOff(2),
  idempotencyKey: 'swagger-booking-demo-v1',
  booking: {
    customerId: ids.alice, vehicleId: ids.aliceCar,
    dealershipId: ids.north, serviceTypeId: ids.oil,
    startTime: '2030-01-16T10:00:00Z',
  },
  timeOff: {
    startsAt: '2030-01-18T13:00:00Z',
    endsAt: '2030-01-18T14:00:00Z',
    reason: 'Demo training session',
  },
} as const;
