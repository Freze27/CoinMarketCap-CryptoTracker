import { createApp } from './app';
import { CoinMarketCapClient } from './clients/coinmarketcap.client';
import { loadConfig } from './config';
import { openDatabase } from './db/database';
import { runMigrations } from './db/migrate';
import { createPriceSyncTask } from './jobs/price-sync.task';
import { TaskScheduler } from './jobs/task-scheduler';
import { createServices } from './services';
import { registerGracefulShutdown } from './shutdown';

function start(): void {
  try {
    const config = loadConfig();
    const db = openDatabase(config.databasePath);
    runMigrations(db);

    const marketData = new CoinMarketCapClient(config.coinMarketCap);
    const services = createServices({ db, marketData, priceCacheTtlMs: config.priceCacheTtlMs });
    const app = createApp({ db, services, apiKey: config.apiKey });
    const scheduler = new TaskScheduler(
      config.priceSync.enabled ? [createPriceSyncTask(services.priceService, config.priceSync.intervalMs)] : [],
    );

    const server = app.listen(config.port, (error) => {
      if (error) {
        console.error(`Failed to start server on port ${config.port}: ${error.message}`);
        process.exit(1);
      }

      console.log(`Server is listening on port ${config.port}`);
      scheduler.start();
    });

    registerGracefulShutdown({ server, scheduler, db, timeoutMs: config.shutdownTimeoutMs });
  } catch (error) {
    console.error('Failed to start application:', error);
    process.exit(1);
  }
}

start();
