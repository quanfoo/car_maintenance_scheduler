import { swaggerDemo } from './common/swagger-demo.js';
import { Type, type Static } from '@sinclair/typebox';
export const UUID = Type.String({ format: 'uuid' });
export const Timestamp = Type.String({ format: 'date-time', pattern: '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d{1,3})?(Z|[+-]\\d{2}:\\d{2})$' });
export const Day = Type.String({ format: 'date' });
export const ErrorResponse = Type.Object({ error: Type.Object({ code: Type.String(), message: Type.String(), requestId: Type.String() }) });
export const errors = { 400: ErrorResponse, 404: ErrorResponse, 409: ErrorResponse, 422: ErrorResponse, 500: ErrorResponse, 503: ErrorResponse };
export const Booking = Type.Object({ customerId: UUID, vehicleId: UUID, dealershipId: UUID, serviceTypeId: UUID, startTime: Timestamp }, {
  additionalProperties: false,
  examples: [swaggerDemo.booking],
});
export const Appointment = Type.Object({ id: UUID, ...Booking.properties, technicianId: UUID, serviceBayId: UUID, endTime: Timestamp, durationMinutes: Type.Integer(), status: Type.Literal('confirmed'), createdAt: Timestamp });
export const AvailabilityQuery = Type.Object({ dealershipId: UUID, serviceTypeId: UUID, date: Day }, { additionalProperties: false });
export const ListQuery = Type.Object({
  dealershipId: Type.Optional(UUID), customerId: Type.Optional(UUID), date: Type.Optional(Day),
  status: Type.Optional(Type.Literal('confirmed')),
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100, default: 20 })),
  offset: Type.Optional(Type.Integer({ minimum: 0, maximum: 10000, default: 0 })),
}, { additionalProperties: false });
export type ListFilters = Static<typeof ListQuery>;
