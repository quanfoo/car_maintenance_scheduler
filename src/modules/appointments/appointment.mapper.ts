import type { Appointment } from '../../generated/prisma/client.js';
/** Keep private idempotency fields out of every response. */
export function publicAppointment(a: Appointment) {
  return { id: a.id, customerId: a.customerId, vehicleId: a.vehicleId, dealershipId: a.dealershipId, serviceTypeId: a.serviceTypeId, technicianId: a.technicianId, serviceBayId: a.serviceBayId, startTime: a.startTime, endTime: a.endTime, durationMinutes: a.durationMinutes, status: a.status, createdAt: a.createdAt };
}
