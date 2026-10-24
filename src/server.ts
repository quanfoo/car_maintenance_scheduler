import { buildApp } from './app.js';
import { PrismaService } from './prisma/prisma.service.js';
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
const app = await buildApp(new PrismaService({ connectionString: process.env.DATABASE_URL }));
app.enableShutdownHooks();
await app.listen(Number(process.env.PORT ?? 3000), process.env.HOST ?? '127.0.0.1');
