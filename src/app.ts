import express, { type Express } from 'express';
import type { Database } from './db/database';
import { createAuthMiddleware } from './middlewares/auth';
import { errorHandler, notFoundHandler } from './middlewares/error-handler';
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
}

export function createApp({ db, services, apiKey }: AppDependencies): Express {
  const cryptocurrencyController = new CryptocurrencyController(services.cryptocurrencyService);
  const priceController = new PriceController(services.priceService);

  const app = express();

  app.use(createHealthRouter(db));
  app.use(
    '/api',
    createAuthMiddleware(apiKey),
    express.json(),
    createCryptocurrencyRouter(cryptocurrencyController),
    createPriceRouter(priceController),
  );
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
