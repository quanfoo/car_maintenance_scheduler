import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import type { Db, PgError } from '../db/index.js';
import { ApiError } from '../errors.js';
import { appointmentEnd, canonicalBooking, fingerprint, utcDay, type BookingInput } from './domain.js';

export const MAX_ALLOCATION_ATTEMPTS = 5;
export const appointmentColumns = `id, customer_id AS "customerId", vehicle_id AS "vehicleId",
  dealership_id AS "dealershipId", service_type_id AS "serviceTypeId", technician_id AS "technicianId",
  service_bay_id AS "serviceBayId", start_time AS "startTime", end_time AS "endTime",
  duration_minutes AS "durationMinutes", status, created_at AS "createdAt"`;
export interface Appointment {
  id: string; customerId: string; vehicleId: string; dealershipId: string; serviceTypeId: string;
  technicianId: string; serviceBayId: string; startTime: Date; endTime: Date;
  durationMinutes: number; status: 'confirmed'; createdAt: Date;
}
export async function offeredService(db: Db, dealershipId: string, serviceTypeId: string) {
  const dealership = await db.query('SELECT id FROM dealerships WHERE id=$1', [dealershipId]);
  if (!dealership.rowCount) throw new ApiError(404, 'DEALERSHIP_NOT_FOUND', 'Dealership not found');
  const result = await db.query<{ duration_minutes: number }>(`SELECT s.duration_minutes FROM service_types s
    JOIN dealership_services ds ON ds.service_type_id=s.id WHERE ds.dealership_id=$1 AND s.id=$2`, [dealershipId, serviceTypeId]);
  if (!result.rows[0]) throw new ApiError(404, 'SERVICE_NOT_FOUND', 'Service is not offered at this dealership');
  return result.rows[0].duration_minutes;
}
export function isRetryable(error: PgError) { return ['23P01', '40001', '40P01', '55P03'].includes(error.code ?? ''); }

export class BookingService {
  constructor(private pool: Pool, private onRetry: () => void = () => {}) {}

  private async replay(db: Db, key: string | undefined, hash: string) {
    if (!key) return;
    const r = await db.query<Appointment>(`SELECT ${appointmentColumns} FROM appointments WHERE idempotency_key=$1`, [key]);
    const appointment = r.rows[0];
    if (!appointment) return;
    const stored = await db.query<{ request_fingerprint: string }>('SELECT request_fingerprint FROM appointments WHERE id=$1', [appointment.id]);
    if (stored.rows[0]?.request_fingerprint !== hash) throw new ApiError(409, 'IDEMPOTENCY_KEY_REUSED', 'Idempotency-Key was used with a different request');
    return { appointment, replayed: true };
  }

  async book(raw: BookingInput, key?: string) {
    const input = canonicalBooking(raw);
    const hash = fingerprint(input);
    const values = [input.customerId, input.vehicleId, input.dealershipId, input.serviceTypeId];
    for (let attempt = 0; attempt < MAX_ALLOCATION_ATTEMPTS; attempt++) {
      const client = await this.pool.connect();
      try {
        await client.query('BEGIN');
        await client.query("SET LOCAL statement_timeout='5s'");
        await client.query("SET LOCAL lock_timeout='3s'");
        if (key) {
          // Unique insertion waits for another transaction with this key. A rollback
          // removes the claim; a commit makes the original result visible below.
          await client.query('INSERT INTO booking_keys(key) VALUES ($1) ON CONFLICT DO NOTHING', [key]);
          await client.query('SELECT key FROM booking_keys WHERE key=$1 FOR UPDATE', [key]);
        }
        const replayed = await this.replay(client, key, hash);
        if (replayed) { await client.query('COMMIT'); return replayed; }
        const duration = await offeredService(client, input.dealershipId, input.serviceTypeId);
        const customer = await client.query('SELECT id FROM customers WHERE id=$1', [input.customerId]);
        if (!customer.rowCount) throw new ApiError(404, 'CUSTOMER_NOT_FOUND', 'Customer not found');
        const vehicle = await client.query<{ customer_id: string }>('SELECT customer_id FROM vehicles WHERE id=$1', [input.vehicleId]);
        if (!vehicle.rows[0]) throw new ApiError(404, 'VEHICLE_NOT_FOUND', 'Vehicle not found');
        if (vehicle.rows[0].customer_id !== input.customerId) throw new ApiError(422, 'VEHICLE_OWNERSHIP_MISMATCH', 'Vehicle does not belong to customer');
        const end = appointmentEnd(input.startTime, duration);
        const pair = await client.query<{ technician_id: string; bay_id: string }>(`WITH technician AS (
          SELECT t.id FROM technicians t JOIN technician_skills sk ON sk.technician_id=t.id
          WHERE t.dealership_id=$1 AND sk.service_type_id=$2 AND NOT EXISTS (
            SELECT 1 FROM appointments a WHERE a.technician_id=t.id AND a.status='confirmed'
            AND tstzrange(a.start_time,a.end_time,'[)') && tstzrange($3::timestamptz,$4::timestamptz,'[)'))
          ORDER BY t.id LIMIT 1 FOR UPDATE OF t SKIP LOCKED
        ), bay AS (
          SELECT b.id FROM service_bays b WHERE b.dealership_id=$1 AND NOT EXISTS (
            SELECT 1 FROM appointments a WHERE a.service_bay_id=b.id AND a.status='confirmed'
            AND tstzrange(a.start_time,a.end_time,'[)') && tstzrange($3::timestamptz,$4::timestamptz,'[)'))
          ORDER BY b.id LIMIT 1 FOR UPDATE OF b SKIP LOCKED
        ) SELECT technician.id AS technician_id, bay.id AS bay_id FROM technician CROSS JOIN bay`, [input.dealershipId, input.serviceTypeId, input.startTime, end]);
        const selected = pair.rows[0];
        if (!selected) {
          // A competing identical request may have committed after the first replay read.
          const result = await this.replay(client, key, hash);
          if (result) { await client.query('COMMIT'); return result; }
          throw new ApiError(409, 'NO_CAPACITY', 'No resource pair is currently allocatable for the full interval; refresh or retry');
        }
        const inserted = await client.query<Appointment>(`INSERT INTO appointments
          (id,customer_id,vehicle_id,dealership_id,service_type_id,technician_id,service_bay_id,start_time,end_time,duration_minutes,idempotency_key,request_fingerprint)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING ${appointmentColumns}`,
        [randomUUID(), ...values, selected.technician_id, selected.bay_id, input.startTime, end, duration, key ?? null, key ? hash : null]);
        await client.query('COMMIT');
        return { appointment: inserted.rows[0]!, replayed: false };
      } catch (error) {
        await client.query('ROLLBACK');
        const pgError = error as PgError;
        if (pgError.code === '23505' && pgError.constraint === 'appointments_idempotency_key_unique') {
          const result = await this.replay(client, key, hash);
          if (result) return result;
        }
        if (isRetryable(pgError)) { this.onRetry(); continue; }
        if (pgError.code === '23503') throw new ApiError(409, 'REFERENCE_CHANGED', 'A referenced record changed; refresh and retry');
        throw error;
      } finally { client.release(); }
    }
    throw new ApiError(409, 'ALLOCATION_CONTENTION', 'Resource allocation was contended; retry with the same idempotency key');
  }
}

export async function availability(pool: Pool, dealershipId: string, serviceTypeId: string, date: string) {
  const { start, end } = utcDay(date);
  const duration = await offeredService(pool, dealershipId, serviceTypeId);
  // A single statement provides one consistent snapshot of both resource classes for all slots.
  const result = await pool.query<{ startTime: Date; endTime: Date; available: boolean }>(`WITH slots AS (
    SELECT slot AS start_time, slot + $4::integer * interval '1 minute' AS end_time
    FROM generate_series($2::timestamptz,$3::timestamptz-interval '30 minutes',interval '30 minutes') slot
  ) SELECT start_time AS "startTime", end_time AS "endTime",
    EXISTS (SELECT 1 FROM technicians t JOIN technician_skills sk ON sk.technician_id=t.id
      WHERE t.dealership_id=$1 AND sk.service_type_id=$5 AND NOT EXISTS (
        SELECT 1 FROM appointments a WHERE a.technician_id=t.id AND a.status='confirmed'
        AND tstzrange(a.start_time,a.end_time,'[)') && tstzrange(slots.start_time,slots.end_time,'[)')))
    AND EXISTS (SELECT 1 FROM service_bays b WHERE b.dealership_id=$1 AND NOT EXISTS (
      SELECT 1 FROM appointments a WHERE a.service_bay_id=b.id AND a.status='confirmed'
      AND tstzrange(a.start_time,a.end_time,'[)') && tstzrange(slots.start_time,slots.end_time,'[)')))
    AS available FROM slots ORDER BY start_time`, [dealershipId, start, end, duration, serviceTypeId]);
  return { dealershipId, serviceTypeId, date, timezone: 'UTC', intervalMinutes: 30, durationMinutes: duration, advisory: true, slots: result.rows };
}
