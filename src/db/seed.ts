import type { Pool } from 'pg';

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

/** Add only named demo records; never truncate user data. Re-running preserves bookings. */
export async function seed(pool: Pool) {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    await c.query('SELECT pg_advisory_xact_lock(1739028143)');
    await c.query('INSERT INTO dealerships VALUES ($1,$2),($3,$4) ON CONFLICT DO NOTHING', [ids.north, 'North Motors', ids.south, 'South Motors']);
    await c.query('INSERT INTO customers VALUES ($1,$2),($3,$4) ON CONFLICT DO NOTHING', [ids.alice, 'Alice Demo', ids.bob, 'Bob Demo']);
    await c.query('INSERT INTO vehicles VALUES ($1,$2,$3),($4,$5,$6) ON CONFLICT DO NOTHING', [ids.aliceCar, ids.alice, 'DEMO0000000000001', ids.bobCar, ids.bob, 'DEMO0000000000002']);
    await c.query('INSERT INTO service_types VALUES ($1,$2,30),($3,$4,60),($5,$6,90) ON CONFLICT DO NOTHING', [ids.oil, 'Oil change', ids.tyres, 'Tyre service', ids.major, 'Major service']);
    await c.query('INSERT INTO dealership_services SELECT d.id,s.id FROM dealerships d CROSS JOIN service_types s WHERE d.id=ANY($1::uuid[]) AND s.id=ANY($2::uuid[]) ON CONFLICT DO NOTHING', [[ids.north, ids.south], [ids.oil, ids.tyres, ids.major]]);
    for (let n = 1; n <= 5; n++) {
      await c.query('INSERT INTO technicians VALUES ($1,$2,$3) ON CONFLICT DO NOTHING', [tech(n), n <= 3 ? ids.north : ids.south, `Technician ${n}`]);
      const skills = n === 1 ? [ids.oil, ids.tyres, ids.major] : n === 2 ? [ids.oil, ids.tyres] : n === 3 ? [ids.major] : n === 4 ? [ids.oil, ids.major] : [ids.tyres];
      for (const s of skills) await c.query('INSERT INTO technician_skills VALUES ($1,$2) ON CONFLICT DO NOTHING', [tech(n), s]);
    }
    for (let n = 1; n <= 3; n++) await c.query('INSERT INTO service_bays VALUES ($1,$2,$3) ON CONFLICT DO NOTHING', [bay(n), n <= 2 ? ids.north : ids.south, `Bay ${n}`]);
    const appointments: [number, number, string, string][] = [
      [1, 1, ids.oil, '09:00'], [2, 2, ids.oil, '09:00'],
      [1, 1, ids.tyres, '10:00'], [2, 2, ids.oil, '10:30'],
      [3, 1, ids.major, '11:00'], [2, 2, ids.tyres, '11:00'],
      [1, 2, ids.oil, '13:00'], [3, 1, ids.major, '14:00'],
      [4, 3, ids.oil, '09:00'], [5, 3, ids.tyres, '10:00'],
    ];
    for (const [i, [t, b, s, time]] of appointments.entries()) {
      await c.query(`INSERT INTO appointments(id,customer_id,vehicle_id,dealership_id,service_type_id,technician_id,service_bay_id,start_time,end_time,duration_minutes)
        SELECT $1,$2,$3,$4,id,$6,$7,$8::timestamptz,$8::timestamptz+duration_minutes*interval '1 minute',duration_minutes
        FROM service_types WHERE id=$5 ON CONFLICT (id) DO NOTHING`,
      [seededAppointment(i + 1), ids.alice, ids.aliceCar, t <= 3 ? ids.north : ids.south, s, tech(t), bay(b), `2030-01-15T${time}:00Z`]);
    }
    await c.query('COMMIT');
  } catch (error) { await c.query('ROLLBACK'); throw error; }
  finally { c.release(); }
}
