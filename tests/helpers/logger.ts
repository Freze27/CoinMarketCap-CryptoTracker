import { createLogger, type Logger } from '../../src/logger/logger';

export interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
  requestId?: string;
  [key: string]: unknown;
}

export interface MemoryLogger {
  logger: Logger;
  logs: LogEntry[];
}

export function createMemoryLogger(): MemoryLogger {
  const logs: LogEntry[] = [];
  const logger = createLogger('trace', (_level, line) => {
    logs.push(JSON.parse(line));
  });

  return { logger, logs };
}
