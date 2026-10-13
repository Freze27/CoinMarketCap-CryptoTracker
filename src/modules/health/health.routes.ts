import { Router } from 'express';
import { isDatabaseAlive, type Database } from '../../db/database';
import type { Logger } from '../../logger/logger';

export function createHealthRouter(db: Database, logger: Logger): Router {
  const router = Router();

  router.get('/health', (_req, res) => {
    const databaseAlive = isDatabaseAlive(db, logger);

    res.status(databaseAlive ? 200 : 503).json({
      status: databaseAlive ? 'ok' : 'error',
      database: databaseAlive ? 'ok' : 'unavailable',
    });
  });

  return router;
}
