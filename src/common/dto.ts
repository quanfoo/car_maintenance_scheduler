import { swaggerDemo } from './swagger-demo.js';
import { ApiProperty } from '@nestjs/swagger';
import type { BookingInput } from '../booking/domain.js';
// Validation is explicit via SchemaPipe so dev/test transpilers need no inferred metadata.
export class CreateAppointmentDto implements BookingInput {
  @ApiProperty({ format: 'uuid', example: swaggerDemo.booking.customerId }) customerId!: string;
  @ApiProperty({ format: 'uuid', example: swaggerDemo.booking.vehicleId }) vehicleId!: string;
  @ApiProperty({ format: 'uuid', example: swaggerDemo.booking.dealershipId }) dealershipId!: string;
  @ApiProperty({ format: 'uuid', example: swaggerDemo.booking.serviceTypeId }) serviceTypeId!: string;
  @ApiProperty({ format: 'date-time', example: swaggerDemo.booking.startTime }) startTime!: string;
}
