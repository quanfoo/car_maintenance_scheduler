import { swaggerDemo } from '../../common/swagger-demo.js';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from '@sinclair/typebox';
import { Timestamp, UUID } from '../../schemas.js';
export const TimeOffInput = Type.Object({ startsAt: Timestamp, endsAt: Timestamp, reason: Type.Optional(Type.Union([Type.String({ maxLength: 500 }), Type.Null()])) }, { additionalProperties: false });
export const TimeOffResponse = Type.Object({ id: UUID, technicianId: UUID, startsAt: Timestamp, endsAt: Timestamp, reason: Type.Union([Type.String(), Type.Null()]) });
export class CreateTimeOffDto {
  @ApiProperty({ format: 'date-time', example: swaggerDemo.timeOff.startsAt }) startsAt!: string;
  @ApiProperty({ format: 'date-time', example: swaggerDemo.timeOff.endsAt }) endsAt!: string;
  @ApiProperty({ required: false, nullable: true, maxLength: 500, type: String, example: swaggerDemo.timeOff.reason }) reason?: string | null;
}
