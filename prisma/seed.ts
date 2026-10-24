import { PrismaService } from '../src/prisma/prisma.service.js';
import { seed } from '../src/db/seed.js';
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
const prisma = new PrismaService({ connectionString: process.env.DATABASE_URL });
try { await seed(prisma); } finally { await prisma.$disconnect(); }
