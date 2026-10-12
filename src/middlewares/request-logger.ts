import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import type { Logger } from '../logger/logger';
import { runWithRequestId } from '../logger/request-context';

const REQUEST_ID_HEADER = 'X-Request-Id';
const REQUEST_ID_PATTERN = /^[A-Za-z0-9._-]{1,64}$/;
const SLOW_REQUEST_MS = 1000;

function resolveRequestId(req: Request): string {
  const incoming = req.get(REQUEST_ID_HEADER);

  return incoming !== undefined && REQUEST_ID_PATTERN.test(incoming) ? incoming : randomUUID();
}

export function createRequestLogger(logger: Logger) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const requestId = resolveRequestId(req);
    const startedAt = Date.now();
    const { method, path } = req;

    res.locals.requestId = requestId;
    res.setHeader(REQUEST_ID_HEADER, requestId);

    res.on('finish', () => {
      const durationMs = Date.now() - startedAt;
      const context = { requestId, method, path, status: res.statusCode, durationMs };

      if (durationMs > SLOW_REQUEST_MS) {
        logger.warn('Request completed slowly', context);
        return;
      }

      logger.info('Request completed', context);
    });

    runWithRequestId(requestId, () => {
      logger.debug('Request received', { method, path, query: req.query });
      next();
    });
  };
}
