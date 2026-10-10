interface AppErrorOptions {
  context?: Record<string, unknown>;
  cause?: unknown;
}

export class AppError extends Error {
  readonly statusCode: number;
  readonly context?: Record<string, unknown>;
  readonly timestamp: string;

  constructor(message: string, statusCode: number, options: AppErrorOptions = {}) {
    super(message, { cause: options.cause });
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.context = options.context;
    this.timestamp = new Date().toISOString();
  }
}

export interface FieldError {
  field: string;
  message: string;
}

export class ValidationError extends AppError {
  readonly details: FieldError[];

  constructor(details: FieldError[]) {
    super('Request validation failed', 400);
    this.details = details;
  }
}

export class UnauthorizedError extends AppError {
  constructor() {
    super('Valid Bearer token is required', 401);
  }
}

export class NotFoundError extends AppError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 404, { context });
  }
}

export class CryptocurrencyNotFoundError extends NotFoundError {
  constructor(id: string) {
    super(`Cryptocurrency with id "${id}" not found`, { id });
  }
}

export class ConflictError extends AppError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 409, { context });
  }
}

export class DatabaseError extends AppError {
  constructor(operation: string, cause: unknown) {
    super(`Database operation failed: ${operation}`, 500, { context: { operation }, cause });
  }
}

export class ExternalApiError extends AppError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 503, { context });
  }
}
