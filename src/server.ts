import { createApp } from './app';
import { config } from './config';
import { openDatabase } from './db/database';

function start(): void {
  try {
    const db = openDatabase(config.databasePath);
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
