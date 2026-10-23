import { createHash } from 'node:crypto';
import { ApiError } from '../errors.js';
export interface BookingInput {
  customerId: string; vehicleId: string; dealershipId: string; serviceTypeId: string; startTime: string;
}
export function canonicalBooking(input: BookingInput): BookingInput {
  const date = new Date(input.startTime);
  if (!Number.isFinite(date.getTime())) throw new ApiError(400, 'VALIDATION_ERROR', 'startTime must be an RFC3339 timestamp');
  return { customerId: input.customerId.toLowerCase(), vehicleId: input.vehicleId.toLowerCase(), dealershipId: input.dealershipId.toLowerCase(), serviceTypeId: input.serviceTypeId.toLowerCase(), startTime: date.toISOString() };
}
export function fingerprint(input: BookingInput) {
  return createHash('sha256').update(JSON.stringify(canonicalBooking(input))).digest('hex');
}
export function appointmentEnd(start: string, durationMinutes: number) {
  return new Date(new Date(start).getTime() + durationMinutes * 60000).toISOString();
}
export function utcDay(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(`${date}T00:00:00Z`)) || new Date(`${date}T00:00:00Z`).toISOString().slice(0,10) !== date) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'date must be a valid UTC date (YYYY-MM-DD)');
  }
  const start = `${date}T00:00:00.000Z`;
  return { start, end: appointmentEnd(start, 1440) };
}
