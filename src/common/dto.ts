import { ApiProperty } from '@nestjs/swagger';
import type { BookingInput } from '../booking/domain.js';
// Validation is explicit via SchemaPipe so dev/test transpilers need no inferred metadata.
export class CreateAppointmentDto implements BookingInput {
  @ApiProperty({ format: 'uuid' }) customerId!: string;
  @ApiProperty({ format: 'uuid' }) vehicleId!: string;
  @ApiProperty({ format: 'uuid' }) dealershipId!: string;
  @ApiProperty({ format: 'uuid' }) serviceTypeId!: string;
  @ApiProperty({ format: 'date-time' }) startTime!: string;
}
