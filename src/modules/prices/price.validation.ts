import { ValidationError, type FieldError } from '../../errors';
import type { PriceHistoryFilter } from './price-history.repository';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2}))?$/;
const INTEGER_PATTERN = /^\d{1,9}$/;
const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 1000;
const ALLOWED_PARAMS = ['from', 'to', 'limit', 'offset'];

function validateDate(field: string, value: unknown, errors: FieldError[]): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== 'string' || !DATE_PATTERN.test(value) || Number.isNaN(Date.parse(value))) {
    errors.push({ field, message: 'must be an ISO 8601 date, for example 2026-10-01T00:00:00Z' });
    return undefined;
  }

  return new Date(value).toISOString();
}

function validateInteger(
  field: string,
  value: unknown,
  defaultValue: number,
  min: number,
  max: number,
  errors: FieldError[],
): number {
  if (value === undefined) {
    return defaultValue;
  }

  const parsed = typeof value === 'string' && INTEGER_PATTERN.test(value) ? Number(value) : NaN;

  if (Number.isNaN(parsed) || parsed < min || parsed > max) {
    errors.push({ field, message: `must be an integer between ${min} and ${max}` });
    return defaultValue;
  }

  return parsed;
}

export function parsePriceHistoryQuery(query: Record<string, unknown>): PriceHistoryFilter {
  const errors: FieldError[] = Object.keys(query)
    .filter((field) => !ALLOWED_PARAMS.includes(field))
    .map((field) => ({ field, message: 'is not allowed' }));

  const from = validateDate('from', query.from, errors);
  const to = validateDate('to', query.to, errors);
  const limit = validateInteger('limit', query.limit, DEFAULT_LIMIT, 1, MAX_LIMIT, errors);
  const offset = validateInteger('offset', query.offset, 0, 0, Number.MAX_SAFE_INTEGER, errors);

  if (from !== undefined && to !== undefined && from > to) {
    errors.push({ field: 'from', message: 'must not be later than "to"' });
  }

  if (errors.length > 0) {
    throw new ValidationError(errors);
  }

  return { from, to, limit, offset };
}
