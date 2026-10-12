import axios from 'axios';
import type { Express } from 'express';
import { createApp } from '../../src/app';
import { CoinMarketCapClient } from '../../src/clients/coinmarketcap.client';
import type { Database } from '../../src/db/database';
import { createTestDatabase } from './database';

jest.mock('axios');

export const TEST_API_KEY = 'test-api-key';
export const AUTH_HEADER = `Bearer ${TEST_API_KEY}`;

export const CMC_TEST_CONFIG = {
  apiKey: 'test-cmc-key',
  baseUrl: 'https://cmc.test',
  timeoutMs: 1000,
  maxRetries: 1,
  retryDelayMs: 0,
};

const KNOWN_COINS: Record<string, { id: number; name: string }> = {
  BTC: { id: 1, name: 'Bitcoin' },
  ETH: { id: 1027, name: 'Ethereum' },
};

export const CMC_QUOTES_PATH = '/v3/cryptocurrency/quotes/latest';
export const KNOWN_PRICES: Record<number, number> = { 1: 65000.5, 1027: 3200.25 };

export interface TestApp {
  app: Express;
  db: Database;
  cmcGet: jest.Mock;
}

export function cmcMapResponse(coins: unknown): { data: unknown } {
  return { data: { status: { error_code: 0 }, data: coins } };
}

export function cmcHttpError(status: number): object {
  return { response: { status } };
}

export function cmcNetworkError(code: string): object {
  return { code };
}

export function cmcQuote(id: number, price: unknown): object {
  return { id, quote: [{ id: 2781, symbol: 'USD', price, last_updated: '2026-10-09T12:39:02.000Z' }] };
}

export function cmcQuotesResponse(prices: Record<number, unknown>): { data: unknown } {
  const coins = Object.entries(prices).map(([id, price]) => cmcQuote(Number(id), price));

  return { data: { status: { error_code: '0' }, data: coins } };
}

export function createCmcGetMock(): jest.Mock {
  return jest.fn(async (path: string, options: { params: { symbol?: string; id?: string } }) => {
    if (path === CMC_QUOTES_PATH) {
      const ids = (options.params.id ?? '').split(',').map(Number);

      return cmcQuotesResponse(Object.fromEntries(ids.map((id) => [id, KNOWN_PRICES[id]])));
    }

    const symbol = options.params.symbol ?? '';
    const coin = KNOWN_COINS[symbol];

    if (!coin) {
      throw cmcHttpError(400);
    }

    return cmcMapResponse([{ ...coin, symbol, rank: 1, is_active: 1 }]);
  });
}

export function quotesCalls(cmcGet: jest.Mock): unknown[][] {
  return cmcGet.mock.calls.filter(([path]) => path === CMC_QUOTES_PATH);
}

export function createTestApp(options: { priceCacheTtlMs?: number } = {}): TestApp {
  const cmcGet = createCmcGetMock();
  jest.mocked(axios.create).mockReturnValue({ get: cmcGet } as never);

  const db = createTestDatabase();
  const marketData = new CoinMarketCapClient(CMC_TEST_CONFIG);
  const app = createApp({
    db,
    marketData,
    apiKey: TEST_API_KEY,
    priceCacheTtlMs: options.priceCacheTtlMs ?? 60_000,
  });

  return { app, db, cmcGet };
}
