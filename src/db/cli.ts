import { PrismaService } from '../prisma/prisma.service.js';
import { createPool } from './index.js';
import { migrate } from './migrate.js';
import { seed } from './seed.js';
const pool = createPool();
try {
  const command = process.argv[2];
  if (command === 'migrate') await migrate(pool);
  else if (command === 'seed') {
    const prisma = new PrismaService({ connectionString: process.env.DATABASE_URL });
    try { await seed(prisma); } finally { await prisma.$disconnect(); }
  }
  else throw new Error('Usage: db/cli.ts migrate|seed');
  console.log(`${command} completed`);
} finally { await pool.end(); }
