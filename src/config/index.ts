import { LOG_LEVELS, type LogLevel } from '../logger/logger';

export interface CoinMarketCapConfig {
  apiKey: string;
  baseUrl: string;
  timeoutMs: number;
  maxRetries: number;
  retryDelayMs: number;
}

export interface PriceSyncConfig {
  enabled: boolean;
  intervalMs: number;
}

export interface AppConfig {
  port: number;
  logLevel: LogLevel | 'silent';
  databasePath: string;
  apiKey: string;
  priceCacheTtlMs: number;
  priceSync: PriceSyncConfig;
  shutdownTimeoutMs: number;
  coinMarketCap: CoinMarketCapConfig;
}

export const PRICE_CURRENCY = 'USD';

const DEFAULT_DATABASE_PATH = './data/app.db';
const DEFAULT_CMC_BASE_URL = 'https://pro-api.coinmarketcap.com';

function readInteger(
  name: string,
  value: string | undefined,
  defaultValue: number,
  min: number,
  max: number,
): number {
  if (value === undefined || value.trim() === '') {
    return defaultValue;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}, received "${value}"`);
  }

  return parsed;
}

function readString(name: string, value: string | undefined, defaultValue?: string): string {
  if (value === undefined && defaultValue !== undefined) {
    return defaultValue;
  }

  if (value === undefined || value.trim() === '') {
    throw new Error(`${name} must not be empty`);
  }

  return value.trim();
}

function readBoolean(name: string, value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined || value.trim() === '') {
    return defaultValue;
  }

  if (value !== 'true' && value !== 'false') {
    throw new Error(`${name} must be "true" or "false", received "${value}"`);
  }

  return value === 'true';
}

function readLogLevel(value: string | undefined): LogLevel | 'silent' {
  if (value === undefined || value.trim() === '') {
    return 'info';
  }

  const allowed: string[] = [...LOG_LEVELS, 'silent'];

  if (!allowed.includes(value)) {
    throw new Error(`LOG_LEVEL must be one of ${allowed.join(', ')}, received "${value}"`);
  }

  return value as LogLevel | 'silent';
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return {
    port: readInteger('PORT', env.PORT, 3000, 1, 65535),
    logLevel: readLogLevel(env.LOG_LEVEL),
    databasePath: readString('DATABASE_PATH', env.DATABASE_PATH, DEFAULT_DATABASE_PATH),
    apiKey: readString('API_KEY', env.API_KEY),
    priceCacheTtlMs: readInteger('PRICE_CACHE_TTL_MS', env.PRICE_CACHE_TTL_MS, 60000, 0, 3600000),
    priceSync: {
      enabled: readBoolean('PRICE_SYNC_ENABLED', env.PRICE_SYNC_ENABLED, true),
      intervalMs: readInteger('PRICE_SYNC_INTERVAL_MS', env.PRICE_SYNC_INTERVAL_MS, 300000, 1000, 86400000),
    },
    shutdownTimeoutMs: readInteger('SHUTDOWN_TIMEOUT_MS', env.SHUTDOWN_TIMEOUT_MS, 10000, 1000, 60000),
    coinMarketCap: {
      apiKey: readString('CMC_API_KEY', env.CMC_API_KEY),
      baseUrl: readString('CMC_BASE_URL', env.CMC_BASE_URL, DEFAULT_CMC_BASE_URL),
      timeoutMs: readInteger('CMC_TIMEOUT_MS', env.CMC_TIMEOUT_MS, 10000, 1, 60000),
      maxRetries: readInteger('CMC_MAX_RETRIES', env.CMC_MAX_RETRIES, 2, 0, 5),
      retryDelayMs: readInteger('CMC_RETRY_DELAY_MS', env.CMC_RETRY_DELAY_MS, 500, 0, 10000),
    },
  };
}
