import { describe, expect, it } from 'vitest';
import { appointmentEnd, canonicalBooking, fingerprint, utcDay } from '../../src/booking/domain.js';
import { ids } from '../../src/db/seed-data.js';
const input = { customerId: ids.alice, vehicleId: ids.aliceCar, dealershipId: ids.north, serviceTypeId: ids.oil, startTime: '2030-01-15T09:00:00Z' };
describe('booking domain', () => {
  it('calculates service durations including midnight rollover', () => {
    expect(appointmentEnd('2030-01-15T23:30:00Z', 90)).toBe('2030-01-16T01:00:00.000Z');
  });
  it('canonicalizes equivalent offsets and payload property order', () => {
    expect(fingerprint(input)).toBe(fingerprint({ startTime: '2030-01-15T16:00:00+07:00', serviceTypeId: ids.oil, dealershipId: ids.north, vehicleId: ids.aliceCar, customerId: ids.alice }));
  });
  it('canonicalizes UUID case', () => {
    expect(canonicalBooking({ ...input, vehicleId: 'ABCDEFAB-0000-4000-8000-000000000001' }).vehicleId).toBe('abcdefab-0000-4000-8000-000000000001');
  });
  it('distinguishes different booking payloads', () => {
    expect(fingerprint(input)).not.toBe(fingerprint({ ...input, serviceTypeId: ids.major }));
  });
  it('rejects invalid timestamps', () => {
    expect(() => canonicalBooking({ ...input, startTime: 'invalid' })).toThrow('RFC3339');
  });
  it('returns a full UTC day independent of host timezone', () => {
    expect(utcDay('2030-01-15')).toEqual({ start: '2030-01-15T00:00:00.000Z', end: '2030-01-16T00:00:00.000Z' });
  });
  it.each(['2030-02-29','2030-02-30','2030-13-01','01-15-2030','2030-1-15'])('rejects invalid date %s', date => {
    expect(() => utcDay(date)).toThrow('valid UTC date');
  });
});
