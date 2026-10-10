import { STATUS_CODES } from 'node:http';
import type { NextFunction, Request, Response } from 'express';
import { AppError, NotFoundError, UnauthorizedError, ValidationError } from '../errors';

function isInvalidJsonError(error: unknown): boolean {
  return (error as { type?: string } | null)?.type === 'entity.parse.failed';
}

function getClientErrorStatus(error: unknown): number | null {
  const status = (error as { status?: unknown } | null)?.status;

  return typeof status === 'number' && status >= 400 && status < 500 ? status : null;
}

export function notFoundHandler(req: Request, _res: Response, next: NextFunction): void {
  next(new NotFoundError(`Route ${req.method} ${req.path} not found`));
}

export function errorHandler(error: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (error instanceof ValidationError) {
    res.status(error.statusCode).json({ error: { message: error.message, details: error.details } });
    return;
  }

  if (error instanceof UnauthorizedError) {
    res.setHeader('WWW-Authenticate', 'Bearer');
  }

  if (error instanceof AppError && error.statusCode !== 500) {
    if (error.statusCode > 500) {
      console.error('Request failed:', error);
    }

    res.status(error.statusCode).json({ error: { message: error.message } });
    return;
  }

  if (isInvalidJsonError(error)) {
    res.status(400).json({ error: { message: 'Request body is not valid JSON' } });
    return;
  }

  const clientErrorStatus = getClientErrorStatus(error);

  if (clientErrorStatus !== null) {
    res.status(clientErrorStatus).json({ error: { message: STATUS_CODES[clientErrorStatus] ?? 'Bad Request' } });
    return;
  }

  console.error('Unhandled error:', error);
  res.status(500).json({ error: { message: 'Internal server error' } });
}
