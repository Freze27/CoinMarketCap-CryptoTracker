import express, { type Express } from 'express';
import type { MarketDataProvider } from './clients/market-data-provider';
import type { Database } from './db/database';
import { createAuthMiddleware } from './middlewares/auth';
import { errorHandler, notFoundHandler } from './middlewares/error-handler';
import { CryptocurrencyController } from './modules/cryptocurrencies/cryptocurrency.controller';
import { createCryptocurrencyRouter } from './modules/cryptocurrencies/cryptocurrency.routes';
import { CryptocurrencyService } from './modules/cryptocurrencies/cryptocurrency.service';
import { SqliteCryptocurrencyRepository } from './modules/cryptocurrencies/sqlite-cryptocurrency.repository';
import { createHealthRouter } from './modules/health/health.routes';

interface AppDependencies {
  db: Database;
  marketData: MarketDataProvider;
  apiKey: string;
}

export function createApp({ db, marketData, apiKey }: AppDependencies): Express {
  const cryptocurrencyRepository = new SqliteCryptocurrencyRepository(db);
  const cryptocurrencyService = new CryptocurrencyService(cryptocurrencyRepository, marketData);
  const cryptocurrencyController = new CryptocurrencyController(cryptocurrencyService);

  const app = express();

  app.use(createHealthRouter(db));
  app.use(
    '/api',
    createAuthMiddleware(apiKey),
    express.json(),
    createCryptocurrencyRouter(cryptocurrencyController),
  );
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
