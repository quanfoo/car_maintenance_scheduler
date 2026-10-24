import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ApiError } from '../../errors.js';
import type { Prisma } from '../../generated/prisma/client.js';
@Injectable()
export class ServiceTypesService {
  constructor(@Inject(PrismaService) private prisma: PrismaService) {}
  async dealershipExists(id: string, db: Prisma.TransactionClient = this.prisma) {
    if (!await db.dealership.findUnique({ where: { id }, select: { id: true } })) throw new ApiError(404, 'DEALERSHIP_NOT_FOUND', 'Dealership not found');
  }
  async offered(dealershipId: string, serviceTypeId: string, db: Prisma.TransactionClient = this.prisma) {
    await this.dealershipExists(dealershipId, db);
    const offering = await db.dealershipService.findUnique({ where: { dealershipId_serviceTypeId: { dealershipId, serviceTypeId } }, include: { serviceType: true } });
    if (!offering) throw new ApiError(404, 'SERVICE_NOT_FOUND', 'Service is not offered at this dealership');
    return offering.serviceType;
  }
  async list(dealershipId: string) {
    await this.dealershipExists(dealershipId);
    return this.prisma.serviceType.findMany({ where: { offerings: { some: { dealershipId } } }, orderBy: [{ durationMinutes: 'asc' }, { id: 'asc' }] });
  }
}
