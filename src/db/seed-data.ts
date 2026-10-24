/** Stable demo identifiers shared by seed and Swagger; no database side effects. */
export const ids = {
  north: '10000000-0000-4000-8000-000000000001',
  south: '10000000-0000-4000-8000-000000000002',
  alice: '20000000-0000-4000-8000-000000000001',
  bob: '20000000-0000-4000-8000-000000000002',
  aliceCar: '30000000-0000-4000-8000-000000000001',
  bobCar: '30000000-0000-4000-8000-000000000002',
  oil: '40000000-0000-4000-8000-000000000001',
  tyres: '40000000-0000-4000-8000-000000000002',
  major: '40000000-0000-4000-8000-000000000003',
};
export const tech = (n: number) => `50000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
export const bay = (n: number) => `60000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
export const seededAppointment = (n: number) => `70000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
export const seededTimeOff = (n: number) => `80000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
