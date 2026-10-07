import { Router } from 'express';
import { isDatabaseAlive, type Database } from '../../db/database';

export function createHealthRouter(db: Database): Router {
  const router = Router();

  router.get('/health', (_req, res) => {
    const databaseAlive = isDatabaseAlive(db);

    res.status(databaseAlive ? 200 : 503).json({
      status: databaseAlive ? 'ok' : 'error',
      database: databaseAlive ? 'ok' : 'unavailable',
    });
  });

  return router;
}
