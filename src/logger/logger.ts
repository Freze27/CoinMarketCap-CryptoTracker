import { getRequestId } from './request-context';

export const LOG_LEVELS = ['error', 'warn', 'info', 'debug', 'trace'] as const;

export type LogLevel = (typeof LOG_LEVELS)[number];
export type LogContext = Record<string, unknown>;
export type LogWriter = (level: LogLevel, line: string) => void;

const SENSITIVE_KEY_PATTERN = /authorization|api[-_]?key|token|secret|password/i;

export interface Logger {
  error(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  debug(message: string, context?: LogContext): void;
  trace(message: string, context?: LogContext): void;
}

function serializeError(error: Error): LogContext {
  const details = error as Error & { statusCode?: number; context?: unknown; code?: unknown };

  return {
    name: error.name,
    message: error.message,
    statusCode: details.statusCode,
    code: details.code,
    context: details.context,
    cause: error.cause instanceof Error ? serializeError(error.cause) : error.cause,
    stack: error.stack,
  };
}

function serializeValue(key: string, value: unknown): unknown {
  if (SENSITIVE_KEY_PATTERN.test(key)) {
    return '[redacted]';
  }

  if (value instanceof Error) {
    return serializeError(value);
  }

  return typeof value === 'bigint' ? value.toString() : value;
}

function stringify(entry: LogContext): string {
  try {
    return JSON.stringify(entry, serializeValue);
  } catch {
    return JSON.stringify({
      timestamp: entry.timestamp,
      level: entry.level,
      message: entry.message,
      requestId: entry.requestId,
      serializationError: 'Log context could not be serialized',
    });
  }
}

function writeToStandardStreams(level: LogLevel, line: string): void {
  const stream = level === 'error' || level === 'warn' ? process.stderr : process.stdout;
  stream.write(`${line}\n`);
}

export function createLogger(level: LogLevel | 'silent', write: LogWriter = writeToStandardStreams): Logger {
  const threshold = LOG_LEVELS.indexOf(level as LogLevel);

  const log = (entryLevel: LogLevel, message: string, context: LogContext = {}): void => {
    if (LOG_LEVELS.indexOf(entryLevel) > threshold) {
      return;
    }

    const timestamp = new Date().toISOString();
    const entry: LogContext = { timestamp, level: entryLevel, message, requestId: getRequestId(), ...context };
    entry.timestamp = timestamp;
    entry.level = entryLevel;
    entry.message = message;

    write(entryLevel, stringify(entry));
  };

  return {
    error: (message, context) => log('error', message, context),
    warn: (message, context) => log('warn', message, context),
    info: (message, context) => log('info', message, context),
    debug: (message, context) => log('debug', message, context),
    trace: (message, context) => log('trace', message, context),
  };
}
