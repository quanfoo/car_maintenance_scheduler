import { PrismaService } from '../src/prisma/prisma.service.js';
import { seed } from '../src/db/seed.js';
const prisma = new PrismaService({ connectionString: process.env.DATABASE_URL });
try { await seed(prisma); } finally { await prisma.$disconnect(); }
