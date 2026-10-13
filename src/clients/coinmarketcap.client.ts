import { setTimeout as delay } from 'node:timers/promises';
import axios, { type AxiosInstance } from 'axios';
import { PRICE_CURRENCY, type CoinMarketCapConfig } from '../config';
import { ExternalApiError } from '../errors';
import type { Logger } from '../logger/logger';
import type { MarketCoin, MarketDataProvider } from './market-data-provider';

interface MapEntry {
  id: number;
  name: string;
  symbol: string;
  rank: number | null;
  isActive: boolean;
}

const MAP_PATH = '/v1/cryptocurrency/map';
const QUOTES_PATH = '/v3/cryptocurrency/quotes/latest';

function getHttpStatus(error: unknown): number | undefined {
  return (error as { response?: { status?: number } } | null)?.response?.status;
}

function isRetryable(error: unknown): boolean {
  const status = getHttpStatus(error);

  return status === undefined || status === 429 || status >= 500;
}

function toMapEntry(value: unknown): MapEntry | null {
  const item = value as Record<string, unknown> | null;

  if (
    typeof item !== 'object' ||
    item === null ||
    !Number.isInteger(item.id) ||
    typeof item.name !== 'string' ||
    typeof item.symbol !== 'string'
  ) {
    return null;
  }

  return {
    id: item.id as number,
    name: item.name,
    symbol: item.symbol,
    rank: typeof item.rank === 'number' ? item.rank : null,
    isActive: item.is_active !== 0,
  };
}

function readPrice(value: unknown): [number, number] | null {
  const item = value as { id?: unknown; quote?: unknown } | null;

  if (typeof item !== 'object' || item === null || !Number.isInteger(item.id) || !Array.isArray(item.quote)) {
    return null;
  }

  const quote = item.quote.find((entry) => entry?.symbol === PRICE_CURRENCY);
  const price: unknown = quote?.price;

  if (typeof price !== 'number' || !Number.isFinite(price) || price < 0) {
    return null;
  }

  return [item.id as number, price];
}

function compareByRelevance(a: MapEntry, b: MapEntry): number {
  if (a.isActive !== b.isActive) {
    return a.isActive ? -1 : 1;
  }

  return (a.rank ?? Infinity) - (b.rank ?? Infinity);
}

export class CoinMarketCapClient implements MarketDataProvider {
  private readonly http: AxiosInstance;

  constructor(
    private readonly config: CoinMarketCapConfig,
    private readonly logger: Logger,
  ) {
    this.http = axios.create({
      baseURL: config.baseUrl,
      timeout: config.timeoutMs,
      headers: {
        'X-CMC_PRO_API_KEY': config.apiKey,
        Accept: 'application/json',
      },
    });
  }

  async findCoinBySymbol(symbol: string): Promise<MarketCoin | null> {
    let body: unknown;

    try {
      body = await this.get(MAP_PATH, { symbol });
    } catch (error) {
      if (getHttpStatus(error) === 400) {
        return null;
      }

      throw this.toExternalApiError(error);
    }

    const [coin] = this.readDataArray(body, MAP_PATH)
      .map(toMapEntry)
      .filter((entry): entry is MapEntry => entry?.symbol.toUpperCase() === symbol.toUpperCase())
      .sort(compareByRelevance);

    return coin ? { cmcId: coin.id, symbol: coin.symbol, name: coin.name } : null;
  }

  async getLatestPrices(cmcIds: number[]): Promise<Map<number, number>> {
    const ids = cmcIds.filter(Number.isInteger);

    if (ids.length === 0) {
      return new Map();
    }

    let body: unknown;

    try {
      body = await this.get(QUOTES_PATH, {
        id: ids.join(','),
        convert: PRICE_CURRENCY,
        skip_invalid: 'true',
      });
    } catch (error) {
      throw this.toExternalApiError(error);
    }

    const prices = this.readDataArray(body, QUOTES_PATH)
      .map(readPrice)
      .filter((entry) => entry !== null);

    return new Map(prices);
  }

  private readDataArray(body: unknown, path: string): unknown[] {
    const data = (body as { data?: unknown } | null)?.data;

    if (!Array.isArray(data)) {
      throw new ExternalApiError('CoinMarketCap returned an unexpected response', { path });
    }

    return data;
  }

  private async get(path: string, params: Record<string, string>): Promise<unknown> {
    for (let attempt = 0; ; attempt += 1) {
      try {
        this.logger.debug('CoinMarketCap request', { path, params, attempt: attempt + 1 });
        const response = await this.http.get(path, { params });
        return response.data;
      } catch (error) {
        if (!isRetryable(error) || attempt >= this.config.maxRetries) {
          throw error;
        }

        const delayMs = this.config.retryDelayMs * 2 ** attempt;
        this.logger.warn('CoinMarketCap request failed, retrying', {
          path,
          attempt: attempt + 1,
          status: getHttpStatus(error),
          code: (error as { code?: string } | null)?.code,
          delayMs,
        });
        await delay(delayMs);
      }
    }
  }

  private toExternalApiError(error: unknown): ExternalApiError {
    return new ExternalApiError('CoinMarketCap is unavailable', {
      status: getHttpStatus(error),
      code: (error as { code?: string } | null)?.code,
    });
  }
}
