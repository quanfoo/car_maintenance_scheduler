import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { buildApp } from '../src/app.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { migrate } from '../src/db/migrate.js';
import { seed, ids, tech } from '../src/db/seed.js';

let container: StartedPostgreSqlContainer;
let pool: pg.Pool;
let prisma: PrismaService;
let app: Awaited<ReturnType<typeof buildApp>>;
let otherApp: Awaited<ReturnType<typeof buildApp>>;
const absent = '99999999-0000-4000-8000-000000000099';
const interval = { startsAt: '2030-01-18T09:00:00Z', endsAt: '2030-01-18T10:00:00Z' };
const path = (n = 4) => `/technicians/${tech(n)}/time-off`;
const leave = (body: object = interval, n = 4, target = app) => target.inject({ method: 'POST', url: path(n), payload: body });
const book = (startTime = interval.startsAt, target = app) => target.inject({ method: 'POST', url: '/appointments', headers: { 'idempotency-key': randomUUID() }, payload: { customerId: ids.alice, vehicleId: ids.aliceCar, dealershipId: ids.south, serviceTypeId: ids.oil, startTime } });
const availability = (dealershipId = ids.south, date = '2030-01-18') => app.inject(`/availability?dealershipId=${dealershipId}&serviceTypeId=${ids.oil}&date=${date}`);
const slot = (body: { slots: { startTime: string; available: boolean }[] }, stamp: string) => body.slots.find(s => s.startTime === stamp)?.available;

beforeAll(async () => {
  container = await new PostgreSqlContainer('postgres:17-bookworm').start();
  pool = new pg.Pool({ connectionString: container.getConnectionUri(), max: 10 });
  await migrate(pool);
  prisma = new PrismaService({ connectionString: container.getConnectionUri(), application_name: 'time-off-app-a' });
  app = await buildApp(prisma, { logger: false });
  otherApp = await buildApp(new PrismaService({ connectionString: container.getConnectionUri(), application_name: 'time-off-app-b' }), { logger: false });
});
beforeEach(async () => {
  await pool.query('TRUNCATE technician_time_off, appointments, booking_keys, technician_skills, technicians, service_bays, dealership_services, service_types, vehicles, customers, dealerships CASCADE');
  await seed(prisma);
});
afterAll(async () => {
  await Promise.all([app?.close(), otherApp?.close()]);
  await pool?.end();
  await container?.stop();
});

async function waitFor(query: string, values: unknown[] = []) {
  const deadline = Date.now() + 2500;
  while (Date.now() < deadline) {
    if ((await pool.query<{ ready: boolean }>(query, values)).rows[0]?.ready) return;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw new Error('Expected PostgreSQL lock state was not observed');
}
/** A database gate pauses a real insert AFTER the application has acquired row locks. */
async function gated(table: 'appointments' | 'technician_time_off', work: (release: () => Promise<void>) => Promise<void>) {
  const gateId = 815304;
  const control = await pool.connect();
  try {
    await control.query('SELECT pg_advisory_lock($1)', [gateId]);
    await pool.query(`CREATE FUNCTION test_schedule_gate() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      PERFORM pg_advisory_xact_lock(${gateId}); RETURN NEW; END $$;
      CREATE TRIGGER schedule_gate BEFORE INSERT ON ${table} FOR EACH ROW EXECUTE FUNCTION test_schedule_gate()`);
    await work(async () => { await control.query('SELECT pg_advisory_unlock($1)', [gateId]); });
  } finally {
    await control.query('SELECT pg_advisory_unlock($1)', [gateId]);
    await pool.query(`DROP TRIGGER IF EXISTS schedule_gate ON ${table}; DROP FUNCTION IF EXISTS test_schedule_gate()`);
    control.release();
  }
}
const waitingAtGate = () => waitFor("SELECT EXISTS(SELECT 1 FROM pg_locks WHERE locktype='advisory' AND objid=815304 AND NOT granted) AS ready");
const waitingForTechnician = () => waitFor("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE wait_event_type='Lock' AND query LIKE '%FROM technicians WHERE id=%FOR UPDATE%') AS ready");
async function expectNoCrossOverlap() {
  const overlaps = await pool.query(`SELECT a.id FROM appointments a JOIN technician_time_off t ON a.technician_id=t.technician_id
    WHERE a.status='confirmed' AND a.start_time<t.ends_at AND a.end_time>t.starts_at`);
  expect(overlaps.rowCount).toBe(0);
}

describe('administrative time-off lifecycle', () => {
  it('creates, lists and deletes time off with nullable reason and normalized timestamps', async () => {
    const created = await leave();
    expect(created.statusCode).toBe(201);
    const body = created.json();
    expect(body).toMatchObject({ technicianId: tech(4), startsAt: '2030-01-18T09:00:00.000Z', endsAt: '2030-01-18T10:00:00.000Z', reason: null });
    const list = await app.inject(path());
    expect(list.statusCode).toBe(200);
    expect(list.json()).toEqual([body]);
    const removed = await app.inject({ method: 'DELETE', url: `${path()}/${body.id}` });
    expect(removed.statusCode).toBe(204);
    expect(removed.body).toBe('');
    expect((await app.inject(path())).json()).toEqual([]);
  });
  it.each([
    { startsAt: interval.startsAt, endsAt: interval.startsAt },
    { startsAt: interval.endsAt, endsAt: interval.startsAt },
    { startsAt: 'not-a-time', endsAt: interval.endsAt },
    { ...interval, startsAt: '2030-02-30T09:00:00Z' },
    { ...interval, reason: 'x'.repeat(501) },
    { ...interval, reason: 123 },
    { ...interval, technicianId: tech(4) },
  ])('rejects invalid intervals or fields without leaving records: %j', async body => {
    expect((await leave(body)).statusCode).toBe(400);
    expect(await prisma.technicianTimeOff.count()).toBe(2);
  });
  it('rejects unknown technicians and malformed identifiers for all operations', async () => {
    const url = `/technicians/${absent}/time-off`;
    expect((await app.inject(url)).statusCode).toBe(404);
    expect((await app.inject({ method: 'POST', url, payload: interval })).statusCode).toBe(404);
    expect((await app.inject({ method: 'DELETE', url: `${url}/${absent}` })).statusCode).toBe(404);
    expect((await app.inject('/technicians/bad/time-off')).statusCode).toBe(400);
  });
  it('rejects overlapping leave but allows adjacent intervals on both sides', async () => {
    expect((await leave()).statusCode).toBe(201);
    const overlap = await leave({ startsAt: '2030-01-18T09:30:00Z', endsAt: '2030-01-18T10:30:00Z' });
    expect(overlap.statusCode).toBe(409);
    expect(overlap.json().error.code).toBe('TIME_OFF_CONFLICT');
    expect((await leave({ startsAt: '2030-01-18T08:00:00Z', endsAt: interval.startsAt })).statusCode).toBe(201);
    expect((await leave({ startsAt: interval.endsAt, endsAt: '2030-01-18T11:00:00Z', reason: 'Training' })).statusCode).toBe(201);
  });
  it('rejects time off over confirmed appointments and allows their end boundary', async () => {
    const conflict = await leave({ startsAt: '2030-01-15T08:45:00Z', endsAt: '2030-01-15T09:15:00Z' });
    expect(conflict.statusCode).toBe(409);
    expect(conflict.json().error.code).toBe('APPOINTMENT_CONFLICT');
    expect((await leave({ startsAt: '2030-01-15T09:30:00Z', endsAt: '2030-01-15T10:00:00Z' })).statusCode).toBe(201);
  });
  it('does not delete a record through another technician or an unknown record', async () => {
    const id = (await leave()).json().id;
    expect((await app.inject({ method: 'DELETE', url: `${path(5)}/${id}` })).statusCode).toBe(404);
    expect((await app.inject({ method: 'DELETE', url: `${path()}/${absent}` })).statusCode).toBe(404);
    expect(await prisma.technicianTimeOff.findUnique({ where: { id } })).not.toBeNull();
  });
  it('documents administrative paths, error contracts and nullable reason', async () => {
    const spec = (await app.inject('/openapi.json')).json();
    expect(spec.paths['/technicians/{id}/time-off'].post.responses['409']).toBeDefined();
    expect(spec.paths['/technicians/{id}/time-off/{timeOffId}'].delete.responses['204']).toBeDefined();
    expect(JSON.stringify(spec)).not.toContain('"type":"null"');
    expect(spec.paths['/technicians/{id}/time-off'].post.requestBody.content['application/json'].schema.properties.reason.nullable).toBe(true);
  });
});

describe('time-off availability and allocation', () => {
  it('excludes leave for the full duration and restores capacity after deletion', async () => {
    const stamp = '2030-01-18T09:00:00.000Z';
    expect(slot((await availability()).json(), stamp)).toBe(true);
    const created = (await leave()).json();
    const body = (await availability()).json();
    expect(slot(body, stamp)).toBe(false);
    expect(slot(body, '2030-01-18T08:30:00.000Z')).toBe(true);
    expect(slot(body, '2030-01-18T10:00:00.000Z')).toBe(true);
    expect((await book()).statusCode).toBe(409);
    await app.inject({ method: 'DELETE', url: `${path()}/${created.id}` });
    expect(slot((await availability()).json(), stamp)).toBe(true);
    expect((await book()).statusCode).toBe(201);
  });
  it('honors the full-day and partial-day seed and selects another qualified technician', async () => {
    const body = (await availability(ids.north, '2030-01-17')).json();
    expect(slot(body, '2030-01-17T08:00:00.000Z')).toBe(true);
    expect(slot(body, '2030-01-17T09:00:00.000Z')).toBe(false);
    expect(slot(body, '2030-01-17T12:00:00.000Z')).toBe(true);
    const result = await app.inject({ method: 'POST', url: '/appointments', payload: { customerId: ids.alice, vehicleId: ids.aliceCar, dealershipId: ids.north, serviceTypeId: ids.oil, startTime: '2030-01-17T08:00:00Z' } });
    expect(result.statusCode).toBe(201);
    expect(result.json().technicianId).toBe(tech(2));
    await expectNoCrossOverlap();
  });
  it('handles midnight-crossing leave and adjacent appointment starts', async () => {
    expect((await leave({ startsAt: '2030-01-17T23:45:00Z', endsAt: '2030-01-18T00:15:00Z' })).statusCode).toBe(201);
    expect(slot((await availability()).json(), '2030-01-18T00:00:00.000Z')).toBe(false);
    expect((await book('2030-01-18T00:15:00Z')).statusCode).toBe(201);
    await expectNoCrossOverlap();
  });
});

describe('time-off database integrity', () => {
  it('enforces FK, valid interval and per-technician overlap even for direct writes', async () => {
    const insert = (technicianId: string, start: string, end: string) => pool.query('INSERT INTO technician_time_off(id,technician_id,starts_at,ends_at) VALUES ($1,$2,$3,$4)', [randomUUID(), technicianId, start, end]);
    await expect(insert(absent, interval.startsAt, interval.endsAt)).rejects.toMatchObject({ code: '23503' });
    await expect(insert(tech(4), interval.endsAt, interval.startsAt)).rejects.toMatchObject({ code: '23514' });
    await insert(tech(4), interval.startsAt, interval.endsAt);
    await expect(insert(tech(4), interval.startsAt, interval.endsAt)).rejects.toMatchObject({ code: '23P01', constraint: 'technician_time_off_no_overlap' });
    await insert(tech(4), interval.endsAt, '2030-01-18T11:00:00Z');
    await insert(tech(5), interval.startsAt, interval.endsAt);
  });
  it('bounds retryable serialization failures at five fresh transactions', async () => {
    await pool.query(`CREATE SEQUENCE time_off_attempts;
      CREATE FUNCTION retry_time_off() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
        PERFORM nextval('time_off_attempts'); RAISE EXCEPTION 'injected serialization conflict' USING ERRCODE='40001'; END $$;
      CREATE TRIGGER retry_time_off BEFORE INSERT ON technician_time_off FOR EACH ROW EXECUTE FUNCTION retry_time_off()`);
    try {
      const response = await leave();
      expect(response.statusCode).toBe(409);
      expect(response.json().error.code).toBe('SCHEDULING_CONTENTION');
      expect(Number((await pool.query('SELECT last_value FROM time_off_attempts')).rows[0].last_value)).toBe(5);
      expect(await prisma.technicianTimeOff.count()).toBe(2);
    } finally { await pool.query('DROP TRIGGER retry_time_off ON technician_time_off; DROP FUNCTION retry_time_off(); DROP SEQUENCE time_off_attempts'); }
    expect((await leave()).statusCode).toBe(201);
  });
  it('rolls back failed inserts, releases row locks and permits a later valid operation', async () => {
    await pool.query(`CREATE FUNCTION fail_time_off() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected failure' USING ERRCODE='23P01'; END $$;
      CREATE TRIGGER fail_time_off BEFORE INSERT ON technician_time_off FOR EACH ROW EXECUTE FUNCTION fail_time_off()`);
    try {
      const response = await leave();
      expect(response.statusCode).toBe(409);
      expect(await prisma.technicianTimeOff.count()).toBe(2);
      await expectNoCrossOverlap();
    } finally { await pool.query('DROP TRIGGER fail_time_off ON technician_time_off; DROP FUNCTION fail_time_off()'); }
    expect((await leave()).statusCode).toBe(201);
  });
});

describe('cross-table concurrency on separate app instances', () => {
  it('commits a booking first; waiting time off rechecks and rejects the appointment', async () => {
    await gated('appointments', async release => {
      const pendingBooking = book();
      await waitingAtGate();
      const pendingLeave = leave(interval, 4, otherApp);
      await waitingForTechnician();
      await release();
      expect((await pendingBooking).statusCode).toBe(201);
      const rejected = await pendingLeave;
      expect(rejected.statusCode).toBe(409);
      expect(rejected.json().error.code).toBe('APPOINTMENT_CONFLICT');
    });
    expect(await prisma.technicianTimeOff.count()).toBe(2);
    await expectNoCrossOverlap();
  });
  it('holds time off first; booking cannot claim the locked technician', async () => {
    await gated('technician_time_off', async release => {
      const pendingLeave = leave();
      await waitingAtGate();
      expect((await book(interval.startsAt, otherApp)).statusCode).toBe(409);
      await release();
      expect((await pendingLeave).statusCode).toBe(201);
    });
    expect((await book()).statusCode).toBe(409);
    await expectNoCrossOverlap();
  });
  it('serializes overlapping leave creation and permits exactly one success', async () => {
    await gated('technician_time_off', async release => {
      const first = leave();
      await waitingAtGate();
      const second = leave(interval, 4, otherApp);
      await waitingForTechnician();
      await release();
      expect((await first).statusCode).toBe(201);
      const rejected = await second;
      expect(rejected.statusCode).toBe(409);
      expect(rejected.json().error.code).toBe('TIME_OFF_CONFLICT');
    });
    expect(await prisma.technicianTimeOff.count()).toBe(3);
    await expectNoCrossOverlap();
  });
});
