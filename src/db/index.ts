import pg from 'pg';
export function createPool(connectionString = process.env.DATABASE_URL) {
  if (!connectionString) throw new Error('DATABASE_URL is required');
  return new pg.Pool({ connectionString, max: 10, connectionTimeoutMillis: 5000, idleTimeoutMillis: 30000, statement_timeout: 5000, query_timeout: 6000 });
}
export type Db = pg.Pool | pg.PoolClient;
export type PgError = Error & { code?: string; constraint?: string };
