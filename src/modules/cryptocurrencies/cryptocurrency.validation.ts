import { ValidationError, type FieldError } from '../../errors';
import type { UpdateCryptocurrencyData } from './cryptocurrency.repository';
import type { CreateCryptocurrencyInput } from './cryptocurrency.service';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SYMBOL_PATTERN = /^[A-Za-z0-9]{1,20}$/;
const NAME_MAX_LENGTH = 100;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireBody(body: unknown): Record<string, unknown> {
  if (!isPlainObject(body)) {
    throw new ValidationError([{ field: 'body', message: 'must be a JSON object' }]);
  }

  return body;
}

function findUnknownFields(body: Record<string, unknown>, allowed: string[]): FieldError[] {
  return Object.keys(body)
    .filter((field) => !allowed.includes(field))
    .map((field) => ({ field, message: 'is not allowed' }));
}

function validateSymbol(value: unknown, errors: FieldError[]): string {
  if (typeof value !== 'string') {
    errors.push({ field: 'symbol', message: 'is required and must be a string' });
    return '';
  }

  const symbol = value.trim();

  if (!SYMBOL_PATTERN.test(symbol)) {
    errors.push({ field: 'symbol', message: 'must contain 1 to 20 latin letters or digits' });
  }

  return symbol;
}

function validateName(value: unknown, errors: FieldError[]): string {
  if (typeof value !== 'string') {
    errors.push({ field: 'name', message: 'is required and must be a string' });
    return '';
  }

  const name = value.trim();

  if (name.length === 0 || name.length > NAME_MAX_LENGTH) {
    errors.push({ field: 'name', message: `must contain 1 to ${NAME_MAX_LENGTH} characters` });
  }

  return name;
}

export function parseCryptocurrencyId(value: unknown): string {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
    throw new ValidationError([{ field: 'id', message: 'must be a valid UUID' }]);
  }

  return value.toLowerCase();
}

export function parseCreateCryptocurrencyBody(body: unknown): CreateCryptocurrencyInput {
  const input = requireBody(body);
  const errors = findUnknownFields(input, ['symbol', 'name']);
  const symbol = validateSymbol(input.symbol, errors);
  const name = validateName(input.name, errors);

  if (errors.length > 0) {
    throw new ValidationError(errors);
  }

  return { symbol, name };
}

export function parseUpdateCryptocurrencyBody(body: unknown): UpdateCryptocurrencyData {
  const input = requireBody(body);
  const errors = findUnknownFields(input, ['name']);
  const name = validateName(input.name, errors);

  if (errors.length > 0) {
    throw new ValidationError(errors);
  }

  return { name };
}
