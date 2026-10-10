import { setTimeout as delay } from 'node:timers/promises';
import axios, { type AxiosInstance } from 'axios';
import type { CoinMarketCapConfig } from '../config';
import { ExternalApiError } from '../errors';
import type { MarketCoin, MarketDataProvider } from './market-data-provider';

interface MapEntry {
  id: number;
  name: string;
  symbol: string;
  rank: number | null;
  isActive: boolean;
}

const MAP_PATH = '/v1/cryptocurrency/map';

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

function compareByRelevance(a: MapEntry, b: MapEntry): number {
  if (a.isActive !== b.isActive) {
    return a.isActive ? -1 : 1;
  }

  return (a.rank ?? Infinity) - (b.rank ?? Infinity);
}

export class CoinMarketCapClient implements MarketDataProvider {
  private readonly http: AxiosInstance;

  constructor(private readonly config: CoinMarketCapConfig) {
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

    const data = (body as { data?: unknown } | null)?.data;

    if (!Array.isArray(data)) {
      throw new ExternalApiError('CoinMarketCap returned an unexpected response', { path: MAP_PATH });
    }

    const [coin] = data
      .map(toMapEntry)
      .filter((entry): entry is MapEntry => entry?.symbol.toUpperCase() === symbol.toUpperCase())
      .sort(compareByRelevance);

    return coin ? { cmcId: coin.id, symbol: coin.symbol, name: coin.name } : null;
  }

  private async get(path: string, params: Record<string, string>): Promise<unknown> {
    for (let attempt = 0; ; attempt += 1) {
      try {
        const response = await this.http.get(path, { params });
        return response.data;
      } catch (error) {
        if (!isRetryable(error) || attempt >= this.config.maxRetries) {
          throw error;
        }

        await delay(this.config.retryDelayMs * 2 ** attempt);
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
