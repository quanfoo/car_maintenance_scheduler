import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { buildApp } from '../src/app.js';
import { migrate } from '../src/db/migrate.js';
import { seed, ids, tech, bay } from '../src/db/seed.js';
import { BookingService, MAX_ALLOCATION_ATTEMPTS } from '../src/booking/service.js';
import type { BookingInput } from '../src/booking/domain.js';

let container: StartedPostgreSqlContainer;
let pool: pg.Pool;
let otherPool: pg.Pool;
let app: Awaited<ReturnType<typeof buildApp>>;
let otherApp: Awaited<ReturnType<typeof buildApp>>;
const missing = '99999999-0000-4000-8000-000000000099';
const input: BookingInput = { customerId: ids.alice, vehicleId: ids.aliceCar, dealershipId: ids.north, serviceTypeId: ids.oil, startTime: '2030-01-16T09:00:00Z' };
const post = (patch: Partial<BookingInput> = {}, key?: string, target = app) => target.inject({ method: 'POST', url: '/appointments', payload: { ...input, ...patch }, headers: key ? { 'idempotency-key': key } : {} });
const getAvailability = (serviceTypeId = ids.oil, dealershipId = ids.north, date = '2030-01-15') => app.inject({ url: `/availability?dealershipId=${dealershipId}&serviceTypeId=${serviceTypeId}&date=${date}` });
const count = async () => Number((await pool.query('SELECT count(*) FROM appointments')).rows[0].count);
async function directInsert(db: pg.Pool | pg.PoolClient, patch: Record<string, string | number> = {}) {
  const record = { id: randomUUID(), customer_id: ids.alice, vehicle_id: ids.aliceCar, dealership_id: ids.north, service_type_id: ids.oil, technician_id: tech(1), service_bay_id: bay(1), start_time: input.startTime, end_time: '2030-01-16T09:30:00Z', duration_minutes: 30, ...patch };
  const keys = Object.keys(record);
  return db.query(`INSERT INTO appointments (${keys.join(',')}) VALUES (${keys.map((_, i) => `$${i+1}`).join(',')})`, Object.values(record));
}

beforeAll(async () => {
  // Always use a disposable container: never truncate a developer-supplied DATABASE_URL.
  container = await new PostgreSqlContainer('postgres:17-bookworm').start();
  pool = new pg.Pool({ connectionString: container.getConnectionUri(), max: 15 });
  otherPool = new pg.Pool({ connectionString: container.getConnectionUri(), max: 10 });
  await migrate(pool);
  await migrate(pool);
  app = await buildApp(pool, { logger: false });
  otherApp = await buildApp(otherPool, { logger: false });
  await Promise.all([app.ready(), otherApp.ready()]);
});
beforeEach(async () => {
  await pool.query('TRUNCATE appointments, booking_keys, technician_skills, technicians, service_bays, dealership_services, service_types, vehicles, customers, dealerships CASCADE');
  await seed(pool);
});
afterAll(async () => {
  await Promise.all([app?.close(), otherApp?.close()]);
  await Promise.all([pool?.end(), otherPool?.end()]);
  await container?.stop();
});

describe('catalog and availability', () => {
  it('lists two dealerships and three fixed-duration services', async () => {
    expect((await app.inject('/dealerships')).json()).toHaveLength(2);
    const response = await app.inject(`/dealerships/${ids.north}/service-types`);
    expect(response.statusCode).toBe(200);
    expect(response.json().map((s: { durationMinutes: number }) => s.durationMinutes)).toEqual([30,60,90]);
    expect((await app.inject(`/dealerships/${missing}/service-types`)).statusCode).toBe(404);
  });
  it('is repeatably seeded without erasing user appointments', async () => {
    await post();
    await seed(pool);
    expect(await count()).toBe(11);
  });
  it('reports fully booked, adjacent, partial and long-interval slots without private details', async () => {
    const response = await getAvailability();
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.slots).toHaveLength(48);
    expect(body).toMatchObject({ timezone: 'UTC', advisory: true, intervalMinutes: 30, durationMinutes: 30 });
    const slot = (time: string) => body.slots.find((s: { startTime: string }) => s.startTime === `2030-01-15T${time}:00.000Z`);
    expect(slot('09:00').available).toBe(false);
    expect(slot('09:30').available).toBe(true);
    expect(slot('10:00').available).toBe(true);
    expect(slot('10:30').available).toBe(false);
    expect(slot('11:00').available).toBe(false);
    expect(JSON.stringify(body)).not.toMatch(/customerId|vehicleId|technicianId|serviceBayId/);
    const long = (await getAvailability(ids.tyres)).json();
    expect(long.slots.find((s: { startTime: string }) => s.startTime === '2030-01-15T08:30:00.000Z').available).toBe(false);
  });
  it('accounts for intervals crossing midnight and non-grid starts', async () => {
    expect((await post({ startTime: '2030-01-15T23:45:00Z', dealershipId: ids.south, serviceTypeId: ids.major })).statusCode).toBe(201);
    const body = (await getAvailability(ids.oil, ids.south, '2030-01-16')).json();
    expect(body.slots[0].available).toBe(false);
    expect(body.slots[2].available).toBe(false);
    expect(body.slots[3].available).toBe(true);
  });
  it.each([['dealershipId', missing], ['serviceTypeId', missing], ['date', '2030-02-30']])('rejects invalid availability %s', async (field, value) => {
    const query = new URLSearchParams({ dealershipId: ids.north, serviceTypeId: ids.oil, date: '2030-01-15', [field]: value });
    expect((await app.inject(`/availability?${query}`)).statusCode).toBe(field === 'date' ? 400 : 404);
  });
});

describe('migration and operational checks', () => {
  it('rejects changed migration history and recovers after restoration', async () => {
    const old = (await pool.query('SELECT sha256 FROM schema_migrations WHERE name=$1', ['001_initial.sql'])).rows[0].sha256;
    try {
      await pool.query('UPDATE schema_migrations SET sha256=$1 WHERE name=$2', ['tampered', '001_initial.sql']);
      await expect(migrate(pool)).rejects.toThrow('Applied migration changed');
    } finally { await pool.query('UPDATE schema_migrations SET sha256=$1 WHERE name=$2', [old, '001_initial.sql']); }
    await migrate(pool);
    expect(await count()).toBe(10);
  });
  it('returns 503 readiness when connected but the application schema is absent', async () => {
    const isolatedPool = new pg.Pool({ connectionString: container.getConnectionUri(), options: '-c search_path=pg_catalog' });
    const isolatedApp = await buildApp(isolatedPool, { logger: false });
    try {
      const response = await isolatedApp.inject('/health/ready');
      expect(response.statusCode).toBe(503);
      expect(response.json().error.code).toBe('DATABASE_UNAVAILABLE');
      expect((await isolatedApp.inject('/health/live')).statusCode).toBe(200);
    } finally { await isolatedApp.close(); await isolatedPool.end(); }
  });
});

describe('booking and retrieval', () => {
  it('persists correct associations, duration, resources, retrieval and location', async () => {
    const result = await post({ serviceTypeId: ids.major });
    expect(result.statusCode).toBe(201);
    const body = result.json();
    expect(body).toMatchObject({ customerId: ids.alice, vehicleId: ids.aliceCar, dealershipId: ids.north, serviceTypeId: ids.major, technicianId: tech(1), serviceBayId: bay(1), durationMinutes: 90, endTime: '2030-01-16T10:30:00.000Z', status: 'confirmed' });
    expect(result.headers.location).toBe(`/appointments/${body.id}`);
    expect((await app.inject(`/appointments/${body.id}`)).json()).toEqual(body);
    expect(await count()).toBe(11);
  });
  it.each(['customerId','vehicleId','dealershipId','serviceTypeId'] as const)('rejects nonexistent %s without writes', async field => {
    const response = await post({ [field]: missing });
    expect(response.statusCode).toBe(404);
    expect(await count()).toBe(10);
  });
  it('rejects malformed UUIDs, invalid timestamps, unknown properties and keys', async () => {
    for (const payload of [{ ...input, customerId: 'bad' }, { ...input, startTime: '2030-02-30T09:00:00Z' }, { ...input, startTime: '2030-01-16T09:00:00' }, { ...input, startTime: '2030-01-16T09:00:00.000001Z' }, { ...input, technicianId: tech(1) }]) {
      expect((await app.inject({ method: 'POST', url: '/appointments', payload })).statusCode).toBe(400);
    }
    expect((await post({}, 'invalid key')).statusCode).toBe(400);
    expect((await app.inject('/availability?dealershipId=bad')).statusCode).toBe(400);
    expect(await count()).toBe(10);
  });
  it('rejects vehicle ownership mismatch', async () => {
    const response = await post({ vehicleId: ids.bobCar });
    expect(response.statusCode).toBe(422);
    expect(response.json().error.code).toBe('VEHICLE_OWNERSHIP_MISMATCH');
    expect(await count()).toBe(10);
  });
  it('rejects when no qualified technician exists', async () => {
    await pool.query('DELETE FROM technician_skills WHERE technician_id=$1 AND service_type_id=$2', [tech(4), ids.major]);
    const response = await post({ dealershipId: ids.south, serviceTypeId: ids.major });
    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe('NO_CAPACITY');
  });
  it('rejects when bays are occupied even if a qualified technician is free', async () => {
    const response = await post({ dealershipId: ids.south, serviceTypeId: ids.tyres, startTime: '2030-01-15T09:00:00Z' });
    expect(response.statusCode).toBe(409);
  });
  it('allocates alternative resources and allows adjacent intervals', async () => {
    const a = await post();
    const b = await post({ startTime: '2030-01-16T09:15:00Z' });
    expect(a.statusCode).toBe(201);
    expect(b.statusCode).toBe(201);
    expect(b.json()).toMatchObject({ technicianId: tech(2), serviceBayId: bay(2) });
    expect((await post()).statusCode).toBe(409);
    const c = await post({ startTime: '2030-01-16T09:30:00Z' });
    expect(c.statusCode).toBe(201);
    expect(c.json()).toMatchObject({ technicianId: tech(1), serviceBayId: bay(1) });
  });
  it('filters and paginates appointments by dealership, customer, date and status', async () => {
    await post();
    const page = (await app.inject(`/appointments?dealershipId=${ids.north}&customerId=${ids.alice}&date=2030-01-15&status=confirmed&limit=3&offset=0`)).json();
    expect(page.items).toHaveLength(3);
    expect(page.hasMore).toBe(true);
    expect(page.items.every((a: { dealershipId: string }) => a.dealershipId === ids.north)).toBe(true);
    const next = (await app.inject(`/appointments?date=2030-01-16`)).json();
    expect(next.items).toHaveLength(1);
    expect(next.hasMore).toBe(false);
    expect((await app.inject('/appointments?limit=101')).statusCode).toBe(400);
    expect((await app.inject('/appointments?status=cancelled')).statusCode).toBe(400);
    expect((await app.inject(`/appointments/${missing}`)).statusCode).toBe(404);
  });
  it('serves OpenAPI, Swagger, readiness, consistent errors, request IDs and metrics', async () => {
    const spec = (await app.inject('/openapi.json')).json();
    expect(spec.paths['/appointments'].post.requestBody).toBeDefined();
    expect(spec.paths['/availability'].get.responses['200']).toBeDefined();
    expect((await app.inject('/docs/')).statusCode).toBe(200);
    expect((await app.inject('/health/ready')).statusCode).toBe(200);
    expect((await app.inject('/health/live')).statusCode).toBe(200);
    const bad = await app.inject('/not-a-route');
    expect(bad.json().error.requestId).toBe(bad.headers['x-request-id']);
    await post();
    await post({ customerId: missing });
    const metrics = await app.inject('/metrics');
    expect(metrics.body).toContain('scheduler_booking_total{outcome="confirmed"}');
    expect(metrics.body).toContain('scheduler_http_request_duration_seconds');
    expect(metrics.body).not.toContain(ids.alice);
  });
});

describe('database invariants (direct writes bypassing API)', () => {
  it.each([
    ['technician dealership', { technician_id: tech(4) }, '23503'],
    ['bay dealership', { service_bay_id: bay(3) }, '23503'],
    ['vehicle ownership', { vehicle_id: ids.bobCar }, '23503'],
    ['qualification', { technician_id: tech(3) }, '23503'],
    ['service duration', { duration_minutes: 60, end_time: '2030-01-16T10:00:00Z' }, '23503'],
    ['end time', { end_time: '2030-01-16T09:45:00Z' }, '23514'],
  ])('enforces %s', async (_name, patch, code) => {
    await expect(directInsert(pool, patch as Record<string, string | number>)).rejects.toMatchObject({ code });
    expect(await count()).toBe(10);
  });
  it('enforces dealership service offerings', async () => {
    await pool.query('DELETE FROM dealership_services WHERE dealership_id=$1 AND service_type_id=$2', [ids.south, ids.major]);
    await expect(directInsert(pool, { dealership_id: ids.south, service_type_id: ids.major, technician_id: tech(4), service_bay_id: bay(3), duration_minutes: 90, end_time: '2030-01-16T10:30:00Z' })).rejects.toMatchObject({ code: '23503' });
    expect((await post({ dealershipId: ids.south, serviceTypeId: ids.major })).statusCode).toBe(404);
  });
  it.each([
    ['technician', { service_bay_id: bay(2) }, 'appointments_technician_no_overlap'],
    ['bay', { technician_id: tech(2) }, 'appointments_bay_no_overlap'],
  ])('blocks a concurrent overlapping %s write until the first transaction commits', async (_name, patch, constraint) => {
    const first = await pool.connect();
    const second = await pool.connect();
    try {
      await first.query('BEGIN');
      await second.query('BEGIN');
      await second.query("SET LOCAL statement_timeout='5s'");
      await directInsert(first);
      const pid = (await second.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
      const pending = directInsert(second, patch as Record<string, string>);
      // Attach the rejection assertion before releasing the competing transaction.
      const checked = expect(pending).rejects.toMatchObject({ code: '23P01', constraint });
      let waiting = false;
      const deadline = Date.now() + 3000;
      while (Date.now() < deadline) {
        const state = await pool.query('SELECT wait_event_type FROM pg_stat_activity WHERE pid=$1', [pid]);
        if (state.rows[0]?.wait_event_type === 'Lock') { waiting = true; break; }
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      expect(waiting).toBe(true);
      await first.query('COMMIT');
      await checked;
      await expect(second.query('SELECT 1')).rejects.toMatchObject({ code: '25P02' });
      await second.query('ROLLBACK');
      expect((await second.query('SELECT 1 AS healthy')).rows[0].healthy).toBe(1);
      expect(await count()).toBe(11);
    } finally {
      await first.query('ROLLBACK'); await second.query('ROLLBACK');
      first.release(); second.release();
    }
  });
});

describe('idempotency and multi-instance concurrency', () => {
  it('replays identical requests, normalizes timestamps, and rejects changed payloads', async () => {
    const first = await post({}, 'demo-key');
    const replay = await post({ startTime: '2030-01-16T16:00:00+07:00' }, 'demo-key');
    expect(first.statusCode).toBe(201);
    expect(replay.statusCode).toBe(200);
    expect(replay.headers['idempotency-replayed']).toBe('true');
    expect(replay.json()).toEqual(first.json());
    const changed = await post({ startTime: '2030-01-16T10:00:00Z' }, 'demo-key');
    expect(changed.statusCode).toBe(409);
    expect(changed.json().error.code).toBe('IDEMPOTENCY_KEY_REUSED');
    expect(await count()).toBe(11);
  });
  it('rolls back a failed key claim so a later valid booking can use that key', async () => {
    const failed = await post({ customerId: missing }, 'not-reserved');
    expect(failed.statusCode).toBe(404);
    expect((await pool.query('SELECT count(*) FROM booking_keys')).rows[0].count).toBe('0');
    expect((await post({}, 'not-reserved')).statusCode).toBe(201);
    expect(await count()).toBe(11);
  });
  it('allows exactly one of twelve requests for a single technician and bay', async () => {
    const responses = await Promise.all(Array.from({ length: 12 }, (_, i) => post({ dealershipId: ids.south }, undefined, i % 2 ? app : otherApp)));
    expect(responses.filter(r => r.statusCode === 201)).toHaveLength(1);
    expect(responses.filter(r => r.statusCode === 409), JSON.stringify(responses.map(r => ({ status: r.statusCode, body: r.json() })))).toHaveLength(11);
    expect(await count()).toBe(11);
  });
  it('fills two resource pairs under contention without double-booking', async () => {
    const responses = await Promise.all(Array.from({ length: 12 }, (_, i) => post({}, `request-${i}`, i % 2 ? app : otherApp)));
    const successes = responses.filter(r => r.statusCode === 201);
    expect(successes).toHaveLength(2);
    expect(responses.filter(r => r.statusCode === 409)).toHaveLength(10);
    expect(new Set(successes.map(r => r.json().technicianId)).size).toBe(2);
    expect(new Set(successes.map(r => r.json().serviceBayId)).size).toBe(2);
    const overlaps = await pool.query(`SELECT a.id FROM appointments a JOIN appointments b ON a.id<b.id
      AND (a.technician_id=b.technician_id OR a.service_bay_id=b.service_bay_id)
      AND tstzrange(a.start_time,a.end_time,'[)') && tstzrange(b.start_time,b.end_time,'[)')`);
    expect(overlaps.rowCount).toBe(0);
    expect(await count()).toBe(12);
  });
  it('creates one appointment for twelve racing identical keys across two instances', async () => {
    const responses = await Promise.all(Array.from({ length: 12 }, (_, i) => post({ dealershipId: ids.south }, 'racing-key', i % 2 ? app : otherApp)));
    expect(responses.filter(r => r.statusCode === 201)).toHaveLength(1);
    expect(responses.filter(r => r.statusCode === 200)).toHaveLength(11);
    expect(new Set(responses.map(r => r.json().id)).size).toBe(1);
    expect(await count()).toBe(11);
  });
  it('rejects racing reuse of a key with different payloads', async () => {
    const responses = await Promise.all([post({}, 'shared'), post({ startTime: '2030-01-16T12:00:00Z' }, 'shared', otherApp)]);
    expect(responses.map(r => r.statusCode).sort()).toEqual([201,409]);
    expect(responses.find(r => r.statusCode === 409)?.json().error.code).toBe('IDEMPOTENCY_KEY_REUSED');
    expect(await count()).toBe(11);
  });
  it('bounds retries using real PostgreSQL fault injection and rolls back every failed insert', async () => {
    await pool.query(`CREATE SEQUENCE test_attempts;
      CREATE FUNCTION fail_allocation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF NEW.idempotency_key='retry-limit' THEN
        PERFORM nextval('test_attempts');
        RAISE EXCEPTION 'injected exclusion failure' USING ERRCODE='23P01';
      END IF; RETURN NEW; END $$;
      CREATE TRIGGER inject_conflict BEFORE INSERT ON appointments FOR EACH ROW EXECUTE FUNCTION fail_allocation()`);
    let retries = 0;
    try {
      const service = new BookingService(pool, () => { retries++; });
      await expect(service.book(input, 'retry-limit')).rejects.toMatchObject({ code: 'ALLOCATION_CONTENTION', statusCode: 409 });
      expect(retries).toBe(MAX_ALLOCATION_ATTEMPTS);
      expect(Number((await pool.query('SELECT last_value FROM test_attempts')).rows[0].last_value)).toBe(MAX_ALLOCATION_ATTEMPTS);
      expect(await count()).toBe(10);
      expect((await pool.query('SELECT count(*) FROM booking_keys')).rows[0].count).toBe('0');
    } finally { await pool.query('DROP TRIGGER inject_conflict ON appointments; DROP FUNCTION fail_allocation(); DROP SEQUENCE test_attempts'); }
    expect((await post({}, 'retry-limit')).statusCode).toBe(201);
  });
});
