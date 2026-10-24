import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import type { Pool } from 'pg';
const run = promisify(execFile);
const root = fileURLToPath(new URL('../../', import.meta.url));
const baseline = '00000000000000_baseline';

/** Validate historic evidence before adoption. Never mark an arbitrary populated DB applied. */
export async function verifyLegacyHistory(pool: Pool) {
  const names = (await readdir(new URL('../../migrations/', import.meta.url))).filter(n => n.endsWith('.sql')).sort();
  for (const name of names) {
    const sql = await readFile(new URL(`../../migrations/${name}`, import.meta.url));
    const stored = await pool.query<{ sha256: string }>('SELECT sha256 FROM schema_migrations WHERE name=$1', [name]);
    if (stored.rows[0]?.sha256 !== createHash('sha256').update(sql).digest('hex')) throw new Error(`Applied migration changed: ${name}`);
  }
  const constraints = await pool.query<{ conname: string }>(`SELECT conname FROM pg_constraint WHERE conrelid='appointments'::regclass AND contype='x' AND convalidated`);
  for (const name of ['appointments_technician_no_overlap','appointments_bay_no_overlap']) {
    if (!constraints.rows.some(c => c.conname === name)) throw new Error(`Legacy database missing constraint: ${name}`);
  }
}
export async function migrate(pool: Pool) {
  const connectionString = pool.options.connectionString;
  if (!connectionString) throw new Error('Migration requires a connection string');
  const execute = async (args: string[]) => {
    try { await run(process.execPath, ['node_modules/prisma/build/index.js', ...args], { cwd: root, env: { ...process.env, DATABASE_URL: connectionString }, maxBuffer: 1024 * 1024 }); }
    catch (error) {
      // CLI diagnostics can include a DSN. Redact it before propagating.
      const e = error as { stderr?: string; stdout?: string };
      // eslint-disable-next-line preserve-caught-error -- CLI causes can bypass DSN redaction.
      throw new Error((e.stderr ?? e.stdout ?? 'Prisma migration failed').replaceAll(connectionString, '[DATABASE_URL]'));
    }
  };
  const state = (await pool.query<{ existing: string | null; history: string | null }>(`SELECT to_regclass('public.appointments')::text AS existing, to_regclass('public._prisma_migrations')::text AS history`)).rows[0]!;
  if (state.existing) {
    await verifyLegacyHistory(pool);
    const applied = state.history ? (await pool.query('SELECT 1 FROM _prisma_migrations WHERE migration_name=$1 AND finished_at IS NOT NULL AND rolled_back_at IS NULL', [baseline])).rowCount : 0;
    if (!applied) await execute(['migrate', 'resolve', '--applied', baseline]);
  }
  await execute(['migrate', 'deploy']);
}
