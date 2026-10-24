import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
@Injectable()
export class DealershipsService {
  constructor(@Inject(PrismaService) private prisma: PrismaService) {}
  list() { return this.prisma.dealership.findMany({ orderBy: { id: 'asc' } }); }
}
