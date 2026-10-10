import axios from 'axios';
import type { Express } from 'express';
import { createApp } from '../../src/app';
import { CoinMarketCapClient } from '../../src/clients/coinmarketcap.client';
import type { Database } from '../../src/db/database';
import { createTestDatabase } from './database';

jest.mock('axios');

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

export function createCmcGetMock(): jest.Mock {
  return jest.fn(async (_path: string, options: { params: { symbol: string } }) => {
    const coin = KNOWN_COINS[options.params.symbol];

    if (!coin) {
      throw cmcHttpError(400);
    }

    return cmcMapResponse([{ ...coin, symbol: options.params.symbol, rank: 1, is_active: 1 }]);
  });
}

export function createTestApp(): TestApp {
  const cmcGet = createCmcGetMock();
  jest.mocked(axios.create).mockReturnValue({ get: cmcGet } as never);

  const db = createTestDatabase();
  const marketData = new CoinMarketCapClient(CMC_TEST_CONFIG);

  return { app: createApp({ db, marketData }), db, cmcGet };
}
