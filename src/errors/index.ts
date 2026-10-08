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
