/** Prisma wraps SQLSTATE differently for raw statements and driver-adapter writes. */
export function databaseError(error: unknown): { code?: string; constraint?: string } {
  if (!error || typeof error !== 'object') return {};
  const e = error as { code?: string; constraint?: string; meta?: Record<string, unknown>; cause?: unknown };
  const adapter = e.meta?.driverAdapterError as { cause?: { originalCode?: string; constraint?: { fields?: string[] }; kind?: string } } | undefined;
  const original = adapter?.cause?.originalCode;
  if (original) return { code: original, constraint: e.constraint };
  if (e.code === 'P2010') return { code: String(e.meta?.code ?? ''), constraint: e.constraint };
  if (e.code === 'P2002') return { code: '23505' };
  if (e.code === 'P2003') return { code: '23503' };
  if (e.code === 'P2034') return { code: '40001' };
  if (['P1001','P1002','P1017','P2024','P2028'].includes(e.code ?? '')) return { code: 'DATABASE_UNAVAILABLE' };
  return { code: e.code, constraint: e.constraint };
}
export function isRetryable(error: unknown) { return ['23P01','40001','40P01','55P03'].includes(databaseError(error).code ?? ''); }
