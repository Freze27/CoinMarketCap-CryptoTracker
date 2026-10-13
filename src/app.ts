import express, { type Express } from 'express';
import type { Database } from './db/database';
import { createDocsRouter } from './docs/docs.routes';
import type { Logger } from './logger/logger';
import { createAuthMiddleware } from './middlewares/auth';
import { createErrorHandler, notFoundHandler } from './middlewares/error-handler';
import { createRequestLogger } from './middlewares/request-logger';
import { CryptocurrencyController } from './modules/cryptocurrencies/cryptocurrency.controller';
import { createCryptocurrencyRouter } from './modules/cryptocurrencies/cryptocurrency.routes';
import { createHealthRouter } from './modules/health/health.routes';
import { PriceController } from './modules/prices/price.controller';
import { createPriceRouter } from './modules/prices/price.routes';
import type { Services } from './services';

interface AppDependencies {
  db: Database;
  services: Services;
  apiKey: string;
  logger: Logger;
}

export function createApp({ db, services, apiKey, logger }: AppDependencies): Express {
  const cryptocurrencyController = new CryptocurrencyController(services.cryptocurrencyService);
  const priceController = new PriceController(services.priceService);

  const app = express();

  app.use(createRequestLogger(logger));
  app.use(createHealthRouter(db, logger));
  app.use(createDocsRouter());
  app.use(
    '/api',
    createAuthMiddleware(apiKey),
    express.json(),
    createCryptocurrencyRouter(cryptocurrencyController),
    createPriceRouter(priceController),
  );
  app.use(notFoundHandler);
  app.use(createErrorHandler(logger));

  return app;
}
