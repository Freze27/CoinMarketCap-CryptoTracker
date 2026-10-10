import { createHash, timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { UnauthorizedError } from '../errors';

const BEARER_PATTERN = /^Bearer (\S+)$/i;

function sha256(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}

export function createAuthMiddleware(apiKey: string) {
  const expectedDigest = sha256(apiKey);

  return (req: Request, _res: Response, next: NextFunction): void => {
    const token = BEARER_PATTERN.exec(req.headers.authorization ?? '')?.[1];

    if (!token || !timingSafeEqual(sha256(token), expectedDigest)) {
      next(new UnauthorizedError());
      return;
    }

    next();
  };
}
