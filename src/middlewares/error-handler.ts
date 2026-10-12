import { STATUS_CODES } from 'node:http';
import type { NextFunction, Request, Response } from 'express';
import { AppError, NotFoundError, UnauthorizedError, ValidationError } from '../errors';
import type { Logger } from '../logger/logger';

interface ErrorResponse {
  status: number;
  message: string;
  details?: unknown;
}

function isInvalidJsonError(error: unknown): boolean {
  return (error as { type?: string } | null)?.type === 'entity.parse.failed';
}

function getClientErrorStatus(error: unknown): number | null {
  const status = (error as { status?: unknown } | null)?.status;

  return typeof status === 'number' && status >= 400 && status < 500 ? status : null;
}

function toErrorResponse(error: unknown): ErrorResponse {
  if (error instanceof ValidationError) {
    return { status: error.statusCode, message: error.message, details: error.details };
  }

  if (error instanceof AppError && error.statusCode !== 500) {
    return { status: error.statusCode, message: error.message };
  }

  if (isInvalidJsonError(error)) {
    return { status: 400, message: 'Request body is not valid JSON' };
  }

  const clientErrorStatus = getClientErrorStatus(error);

  if (clientErrorStatus !== null) {
    return { status: clientErrorStatus, message: STATUS_CODES[clientErrorStatus] ?? 'Bad Request' };
  }

  return { status: 500, message: 'Internal server error' };
}

export function notFoundHandler(req: Request, _res: Response, next: NextFunction): void {
  next(new NotFoundError(`Route ${req.method} ${req.path} not found`));
}

export function createErrorHandler(logger: Logger) {
  return (error: unknown, req: Request, res: Response, _next: NextFunction): void => {
    const { status, message, details } = toErrorResponse(error);
    const context = { requestId: res.locals.requestId, method: req.method, path: req.path, status };

    if (status >= 500) {
      logger.error('Request failed', { ...context, error });
    } else {
      logger.warn('Request rejected', { ...context, reason: message, details });
    }

    if (error instanceof UnauthorizedError) {
      res.setHeader('WWW-Authenticate', 'Bearer');
    }

    res.status(status).json({ error: { message, details } });
  };
}
