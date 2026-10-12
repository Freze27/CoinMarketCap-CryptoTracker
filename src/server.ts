import { createApp } from './app';
import { CoinMarketCapClient } from './clients/coinmarketcap.client';
import { loadConfig } from './config';
import { openDatabase } from './db/database';
import { runMigrations } from './db/migrate';
import { createPriceSyncTask } from './jobs/price-sync.task';
import { TaskScheduler } from './jobs/task-scheduler';
import { createLogger } from './logger/logger';
import { createServices } from './services';
import { registerGracefulShutdown } from './shutdown';

function start(): void {
  let logger = createLogger('info');

  try {
    const config = loadConfig();
    logger = createLogger(config.logLevel);

    const db = openDatabase(config.databasePath);
    runMigrations(db, logger);

    const marketData = new CoinMarketCapClient(config.coinMarketCap, logger);
    const services = createServices({ db, marketData, priceCacheTtlMs: config.priceCacheTtlMs, logger });
    const app = createApp({ db, services, apiKey: config.apiKey, logger });
    const scheduler = new TaskScheduler(
      config.priceSync.enabled ? [createPriceSyncTask(services.priceService, config.priceSync.intervalMs)] : [],
      logger,
    );

    const server = app.listen(config.port, (error) => {
      if (error) {
        logger.error('Failed to start server', { port: config.port, error });
        process.exit(1);
      }

      logger.info('Server is listening', { port: config.port });
      scheduler.start();
    });

    registerGracefulShutdown({ server, scheduler, db, logger, timeoutMs: config.shutdownTimeoutMs });
  } catch (error) {
    logger.error('Failed to start application', { error });
    process.exit(1);
  }
}

start();
