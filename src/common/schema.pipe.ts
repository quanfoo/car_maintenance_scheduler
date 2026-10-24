import { type PipeTransform } from '@nestjs/common';
import { Ajv } from 'ajv';
import addFormats from 'ajv-formats';
import type { TSchema } from '@sinclair/typebox';
import { ApiError } from '../errors.js';
// Preserve the existing strict AJV contract, including bounded date-time precision.
const ajv = new Ajv({ coerceTypes: true, useDefaults: true, allErrors: true, strict: false });
const strictAjv = new Ajv({ coerceTypes: false, allErrors: true, strict: false });
for (const instance of [ajv, strictAjv]) (addFormats as unknown as (a: Ajv) => void)(instance);
export class SchemaPipe implements PipeTransform {
  private validate;
  constructor(schema: TSchema, coerce = true) { this.validate = (coerce ? ajv : strictAjv).compile(schema); }
  transform(value: unknown) {
    if (!this.validate(value)) throw new ApiError(400, 'VALIDATION_ERROR', 'Request does not match the API schema');
    return value;
  }
}
