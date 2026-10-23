import { buildApp } from './app.js';
import { createPool } from './db/index.js';
const pool = createPool();
const app = await buildApp(pool);
pool.on('error', error => app.log.error({ code: (error as { code?: string }).code }, 'Idle database connection failed'));
const close = async () => {
  await app.close();
  await pool.end();
};
process.once('SIGTERM', () => { void close(); });
process.once('SIGINT', () => { void close(); });
try {
  await app.listen({ port: Number(process.env.PORT ?? 3000), host: process.env.HOST ?? '127.0.0.1' });
} catch (error) {
  app.log.error({ errorName: (error as Error).name }, 'Startup failed');
  await close();
  process.exitCode = 1;
}
