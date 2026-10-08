import { createApp } from './app';
import { loadConfig } from './config';
import { openDatabase } from './db/database';
import { runMigrations } from './db/migrate';

function start(): void {
  try {
    const config = loadConfig();
    const db = openDatabase(config.databasePath);
    runMigrations(db);
    const app = createApp({ db });

    app.listen(config.port, (error) => {
      if (error) {
        console.error(`Failed to start server on port ${config.port}: ${error.message}`);
        process.exit(1);
      }

      console.log(`Server is listening on port ${config.port}`);
    });
  } catch (error) {
    console.error('Failed to start application:', error);
    process.exit(1);
  }
}

start();
