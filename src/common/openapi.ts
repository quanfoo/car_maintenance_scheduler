import { applyDecorators } from '@nestjs/common';
import { errors } from '../schemas.js';
import { ApiBody, ApiResponse } from '@nestjs/swagger';
type ResponseSchema = Extract<Parameters<typeof ApiResponse>[0], { schema: unknown }>['schema'];
import type { TSchema } from '@sinclair/typebox';
/** TypeBox JSON Schema uses const/numeric exclusives; OpenAPI 3.0 uses enum/flags. */
function convert(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(convert);
  if (!value || typeof value !== 'object') return value;
  const source = value as Record<string, unknown>;
  if (Array.isArray(source.anyOf)) {
    const variants = source.anyOf as { type?: string }[];
    if (variants.some(v => v.type === 'null')) {
      const nonNull = variants.filter(v => v.type !== 'null');
      return { ...(nonNull.length === 1 ? convert(nonNull[0]) as object : { anyOf: nonNull.map(convert) }), nullable: true };
    }
  }
  const result: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (key === 'const') result.enum = [child];
    else if ((key === 'exclusiveMinimum' || key === 'exclusiveMaximum') && typeof child === 'number') {
      result[key === 'exclusiveMinimum' ? 'minimum' : 'maximum'] = child;
      result[key] = true;
    } else result[key] = convert(child);
  }
  return result;
}
export function ApiJsonResponse(options: { status: number; schema: TSchema }) {
  return ApiResponse({ status: options.status, schema: convert(options.schema) as ResponseSchema });
}

export function ApiErrors() {
  return applyDecorators(...Object.entries(errors).map(([status, schema]) => ApiJsonResponse({ status: Number(status), schema })));
}

export function ApiJsonBody(schema: TSchema) { return ApiBody({ schema: convert(schema) as ResponseSchema }); }
