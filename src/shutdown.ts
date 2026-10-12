import type { Server } from 'node:http';
import type { Database } from './db/database';
import type { TaskScheduler } from './jobs/task-scheduler';
import type { Logger } from './logger/logger';

const SHUTDOWN_SIGNALS = ['SIGINT', 'SIGTERM'] as const;

interface ShutdownDependencies {
  server: Server;
  scheduler: TaskScheduler;
  db: Database;
  logger: Logger;
  timeoutMs: number;
  processRef?: Pick<NodeJS.Process, 'on' | 'exit'>;
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
    server.closeIdleConnections();
  });
}

export function registerGracefulShutdown({
  server,
  scheduler,
  db,
  logger,
  timeoutMs,
  processRef = process,
}: ShutdownDependencies): void {
  let shuttingDown = false;

  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    logger.info('Shutdown signal received', { signal });

    const forceExit = setTimeout(() => {
      logger.error('Shutdown did not finish in time, forcing exit', { timeoutMs });
      processRef.exit(1);
    }, timeoutMs);
    forceExit.unref();

    try {
      await Promise.all([scheduler.stop(), closeServer(server)]);
      db.close();
      clearTimeout(forceExit);
      logger.info('Shutdown completed');
      processRef.exit(0);
    } catch (error) {
      clearTimeout(forceExit);
      logger.error('Shutdown failed', { error });
      processRef.exit(1);
    }
  };

  for (const signal of SHUTDOWN_SIGNALS) {
    processRef.on(signal, () => void shutdown(signal));
  }
}
