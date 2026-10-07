import express, { type Express } from 'express';
import type { Database } from './db/database';
import { createHealthRouter } from './modules/health/health.routes';

interface AppDependencies {
  db: Database;
}

export function createApp({ db }: AppDependencies): Express {
  const app = express();

  app.use(createHealthRouter(db));

  return app;
}
