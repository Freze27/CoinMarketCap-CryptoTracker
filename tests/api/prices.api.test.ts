import { setTimeout as delay } from 'node:timers/promises';
import type { Express } from 'express';
import request from 'supertest';
import type { Database } from '../../src/db/database';
import { SqlitePriceHistoryRepository } from '../../src/modules/prices/sqlite-price-history.repository';
import type { LogEntry } from '../helpers/logger';
import {
  AUTH_HEADER,
  CMC_QUOTES_PATH,
  cmcHttpError,
  cmcNetworkError,
  cmcQuote,
  cmcQuotesResponse,
  createTestApp,
  quotesCalls,
} from '../helpers/app';

const MISSING_ID = '00000000-0000-4000-8000-000000000000';
const DAY_1 = '2026-10-01T10:00:00.000Z';
const DAY_2 = '2026-10-02T10:00:00.000Z';
const DAY_3 = '2026-10-03T10:00:00.000Z';

describe('Prices API', () => {
  let app: Express;
  let db: Database;
  let cmcGet: jest.Mock;
  let logs: LogEntry[];

  function api(): ReturnType<typeof request.agent> {
    return request.agent(app).set('Authorization', AUTH_HEADER);
  }

  function useApp(options?: { priceCacheTtlMs?: number }): void {
    ({ app, db, cmcGet, logs } = createTestApp(options));
  }

  async function track(symbol: string, name: string): Promise<string> {
    const response = await api().post('/api/cryptocurrencies').send({ symbol, name });
    return response.body.data.id;
  }

  async function saveHistory(cryptocurrencyId: string, prices: Array<[number, string]>): Promise<void> {
    await new SqlitePriceHistoryRepository(db).addMany(
      prices.map(([price, fetchedAt]) => ({ cryptocurrencyId, price, fetchedAt })),
    );
  }

  beforeEach(() => {
    useApp();
  });

  afterEach(() => {
    db.close();
  });

  describe('GET /api/prices', () => {
    it('GetLatest_ShouldReturn200AndPricesFromCoinMarketCap_WhenCryptocurrenciesAreTracked', async () => {
      const ethereumId = await track('ETH', 'Ethereum');
      const bitcoinId = await track('BTC', 'Bitcoin');

      const response = await api().get('/api/prices');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        data: [
          { cryptocurrencyId: bitcoinId, symbol: 'BTC', name: 'Bitcoin', price: 65000.5, fetchedAt: expect.any(String) },
          { cryptocurrencyId: ethereumId, symbol: 'ETH', name: 'Ethereum', price: 3200.25, fetchedAt: expect.any(String) },
        ],
        currency: 'USD',
        stale: false,
      });
    });

    it('GetLatest_ShouldRequestAllCryptocurrenciesByCmcIdInOneCall_WhenPricesAreNotStored', async () => {
      await track('ETH', 'Ethereum');
      await track('BTC', 'Bitcoin');

      await api().get('/api/prices');

      expect(quotesCalls(cmcGet)).toEqual([
        [CMC_QUOTES_PATH, { params: { id: '1,1027', convert: 'USD', skip_invalid: 'true' } }],
      ]);
    });

    it('GetLatest_ShouldSavePricesToHistory_WhenPricesAreReceived', async () => {
      const bitcoinId = await track('BTC', 'Bitcoin');

      const latest = await api().get('/api/prices');
      const history = await api().get(`/api/cryptocurrencies/${bitcoinId}/prices`);

      expect(history.body.data).toEqual([{ price: 65000.5, fetchedAt: latest.body.data[0].fetchedAt }]);
    });

    it('GetLatest_ShouldSetUpdateTimeOfCryptocurrency_WhenPricesAreReceived', async () => {
      const bitcoinId = await track('BTC', 'Bitcoin');

      const latest = await api().get('/api/prices');
      const cryptocurrency = await api().get(`/api/cryptocurrencies/${bitcoinId}`);

      expect(cryptocurrency.body.data.updatedAt).toBe(latest.body.data[0].fetchedAt);
    });

    it('GetLatest_ShouldReturn200AndEmptyListWithoutCallingCoinMarketCap_WhenNothingIsTracked', async () => {
      const response = await api().get('/api/prices');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ data: [], currency: 'USD', stale: false });
      expect(cmcGet).not.toHaveBeenCalled();
    });

    it('GetLatest_ShouldReturnStoredPricesWithoutCallingCoinMarketCap_WhenPricesAreFresh', async () => {
      await track('BTC', 'Bitcoin');
      const first = await api().get('/api/prices');

      const second = await api().get('/api/prices');

      expect(second.body).toEqual(first.body);
      expect(quotesCalls(cmcGet)).toHaveLength(1);
    });

    it('GetLatest_ShouldCallCoinMarketCapOnceAndSaveOnePrice_WhenRequestsAreConcurrent', async () => {
      const bitcoinId = await track('BTC', 'Bitcoin');
      cmcGet.mockImplementation(async () => {
        await delay(100);
        return cmcQuotesResponse({ 1: 65000.5 });
      });

      const responses = await Promise.all([api().get('/api/prices'), api().get('/api/prices'), api().get('/api/prices')]);

      expect(responses.map((response) => response.body.data[0].price)).toEqual([65000.5, 65000.5, 65000.5]);
      expect(quotesCalls(cmcGet)).toHaveLength(1);
      const history = await api().get(`/api/cryptocurrencies/${bitcoinId}/prices`);
      expect(history.body.data).toHaveLength(1);
    });

    it('GetLatest_ShouldSkipCryptocurrencyWithoutCmcId_WhenRowWasCreatedBeforeCmcIdExisted', async () => {
      await track('BTC', 'Bitcoin');
      db.prepare(
        "INSERT INTO cryptocurrencies (id, symbol, name, updated_at) VALUES ('11111111-1111-4111-8111-111111111111', 'OLD', 'Legacy', '2020-01-01T00:00:00.000Z')",
      ).run();

      const response = await api().get('/api/prices');

      expect(quotesCalls(cmcGet)[0]).toEqual([CMC_QUOTES_PATH, { params: { id: '1', convert: 'USD', skip_invalid: 'true' } }]);
      expect(response.body.data).toEqual([
        expect.objectContaining({ symbol: 'BTC', price: 65000.5 }),
        expect.objectContaining({ symbol: 'OLD', price: null }),
      ]);
    });

    it('GetLatest_ShouldCallCoinMarketCapAgain_WhenStoredPricesAreExpired', async () => {
      useApp({ priceCacheTtlMs: 0 });
      const bitcoinId = await track('BTC', 'Bitcoin');
      await saveHistory(bitcoinId, [[100, DAY_1]]);

      const response = await api().get('/api/prices');

      expect(response.body.data[0].price).toBe(65000.5);
      expect(quotesCalls(cmcGet)).toHaveLength(1);
    });

    it('GetLatest_ShouldCallCoinMarketCap_WhenNewCryptocurrencyHasNoPriceYet', async () => {
      await track('BTC', 'Bitcoin');
      await api().get('/api/prices');
      await track('ETH', 'Ethereum');

      const response = await api().get('/api/prices');

      expect(response.body.data.map((item: { price: number }) => item.price)).toEqual([65000.5, 3200.25]);
      expect(quotesCalls(cmcGet)).toHaveLength(2);
    });

    it.each([
      ['TimesOut', cmcNetworkError('ECONNABORTED')],
      ['RespondsWith500', cmcHttpError(500)],
      ['RejectsApiKey', cmcHttpError(401)],
    ])('GetLatest_ShouldReturn200WithStoredPricesMarkedStale_WhenCoinMarketCap%s', async (_case, error) => {
      useApp({ priceCacheTtlMs: 0 });
      const bitcoinId = await track('BTC', 'Bitcoin');
      await saveHistory(bitcoinId, [[100, DAY_1]]);
      cmcGet.mockRejectedValue(error);

      const response = await api().get('/api/prices');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        data: [{ cryptocurrencyId: bitcoinId, symbol: 'BTC', name: 'Bitcoin', price: 100, fetchedAt: DAY_1 }],
        currency: 'USD',
        stale: true,
      });
      expect(logs).toContainEqual(
        expect.objectContaining({ level: 'warn', message: 'Failed to refresh prices, serving stored prices' }),
      );
      expect(JSON.stringify(logs)).not.toContain('test-cmc-key');
    });

    it('GetLatest_ShouldReturn503_WhenCoinMarketCapIsUnavailableAndNoPricesAreStored', async () => {
      await track('BTC', 'Bitcoin');
      cmcGet.mockRejectedValue(cmcHttpError(500));

      const response = await api().get('/api/prices');

      expect(response.status).toBe(503);
      expect(response.body).toEqual({ error: { message: 'CoinMarketCap is unavailable' } });
    });

    it('GetLatest_ShouldReturn503_WhenCoinMarketCapReturnsUnexpectedResponseAndNoPricesAreStored', async () => {
      await track('BTC', 'Bitcoin');
      cmcGet.mockResolvedValue({ data: { data: { 1: {} } } });

      const response = await api().get('/api/prices');

      expect(response.status).toBe(503);
      expect(response.body).toEqual({ error: { message: 'CoinMarketCap returned an unexpected response' } });
    });

    it('GetLatest_ShouldReturnNullPrice_WhenCoinMarketCapDoesNotReturnCryptocurrency', async () => {
      await track('BTC', 'Bitcoin');
      await track('ETH', 'Ethereum');
      cmcGet.mockResolvedValue(cmcQuotesResponse({ 1: 65000.5 }));

      const response = await api().get('/api/prices');

      expect(response.status).toBe(200);
      expect(response.body.data).toEqual([
        expect.objectContaining({ symbol: 'BTC', price: 65000.5 }),
        expect.objectContaining({ symbol: 'ETH', price: null, fetchedAt: null }),
      ]);
    });

    it.each([
      ['PriceIsNull', cmcQuote(1027, null)],
      ['PriceIsNegative', cmcQuote(1027, -5)],
      ['PriceIsText', cmcQuote(1027, '3200')],
      ['QuoteIsForAnotherCurrency', { id: 1027, quote: [{ symbol: 'EUR', price: 3000 }] }],
      ['QuoteIsNotAnArray', { id: 1027, quote: { USD: { price: 3200 } } }],
      ['EntryIsNotAnObject', 'broken'],
    ])('GetLatest_ShouldSkipCryptocurrencyAndKeepTheRest_When%s', async (_case, brokenEntry) => {
      await track('BTC', 'Bitcoin');
      await track('ETH', 'Ethereum');
      cmcGet.mockResolvedValue({ data: { data: [cmcQuote(1, 65000.5), brokenEntry] } });

      const response = await api().get('/api/prices');

      expect(response.status).toBe(200);
      expect(response.body.data).toEqual([
        expect.objectContaining({ symbol: 'BTC', price: 65000.5 }),
        expect.objectContaining({ symbol: 'ETH', price: null }),
      ]);
    });

    it('GetLatest_ShouldReturn401_WhenTokenIsMissing', async () => {
      const response = await request(app).get('/api/prices');

      expect(response.status).toBe(401);
      expect(cmcGet).not.toHaveBeenCalled();
    });
  });

  describe('GET /api/cryptocurrencies/:id/prices', () => {
    let bitcoinId: string;

    beforeEach(async () => {
      bitcoinId = await track('BTC', 'Bitcoin');
      const ethereumId = await track('ETH', 'Ethereum');
      await saveHistory(bitcoinId, [
        [1, DAY_1],
        [2, DAY_2],
        [3, DAY_3],
      ]);
      await saveHistory(ethereumId, [[100, DAY_2]]);
    });

    it('GetHistory_ShouldReturn200AndPricesNewestFirst_WhenCryptocurrencyHasHistory', async () => {
      const response = await api().get(`/api/cryptocurrencies/${bitcoinId}/prices`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        data: [
          { price: 3, fetchedAt: DAY_3 },
          { price: 2, fetchedAt: DAY_2 },
          { price: 1, fetchedAt: DAY_1 },
        ],
        currency: 'USD',
        pagination: { limit: 100, offset: 0 },
      });
    });

    it('GetHistory_ShouldNotCallCoinMarketCap_WhenHistoryIsRequested', async () => {
      cmcGet.mockClear();

      await api().get(`/api/cryptocurrencies/${bitcoinId}/prices`);

      expect(cmcGet).not.toHaveBeenCalled();
    });

    it('GetHistory_ShouldReturnPricesInsidePeriod_WhenFromAndToAreSet', async () => {
      const response = await api()
        .get(`/api/cryptocurrencies/${bitcoinId}/prices`)
        .query({ from: DAY_2, to: DAY_3 });

      expect(response.body.data.map((item: { price: number }) => item.price)).toEqual([3, 2]);
    });

    it('GetHistory_ShouldCompareSameMoment_WhenDateHasTimeZoneOffset', async () => {
      const response = await api()
        .get(`/api/cryptocurrencies/${bitcoinId}/prices`)
        .query({ from: '2026-10-02T13:00:00+03:00', to: '2026-10-02T13:00:00+03:00' });

      expect(response.body.data).toEqual([{ price: 2, fetchedAt: DAY_2 }]);
    });

    it('GetHistory_ShouldTreatDateWithoutTimeAsUtcMidnight_WhenOnlyDateIsPassed', async () => {
      const response = await api().get(`/api/cryptocurrencies/${bitcoinId}/prices`).query({ from: '2026-10-02' });

      expect(response.body.data.map((item: { price: number }) => item.price)).toEqual([3, 2]);
    });

    it.each([
      ['February29InLeapYear', '2028-02-29'],
      ['LastDayOfMonth', '2026-10-31T23:59:59.999Z'],
      ['DateWithPositiveOffset', '2026-12-31T23:00:00+14:00'],
      ['DateWithNegativeOffset', '2026-01-01T00:00:00-12:00'],
    ])('GetHistory_ShouldReturn200_WhenDateIs%s', async (_case, from) => {
      const response = await api().get(`/api/cryptocurrencies/${bitcoinId}/prices`).query({ from });

      expect(response.status).toBe(200);
    });

    it('GetHistory_ShouldReturnRequestedPage_WhenLimitAndOffsetAreSet', async () => {
      const response = await api().get(`/api/cryptocurrencies/${bitcoinId}/prices`).query({ limit: 1, offset: 1 });

      expect(response.body.data).toEqual([{ price: 2, fetchedAt: DAY_2 }]);
      expect(response.body.pagination).toEqual({ limit: 1, offset: 1 });
    });

    it('GetHistory_ShouldReturn200AndEmptyList_WhenCryptocurrencyHasNoHistory', async () => {
      const response = await api()
        .get(`/api/cryptocurrencies/${bitcoinId}/prices`)
        .query({ from: '2030-01-01T00:00:00Z' });

      expect(response.status).toBe(200);
      expect(response.body.data).toEqual([]);
    });

    it('GetHistory_ShouldReturn404_WhenCryptocurrencyDoesNotExist', async () => {
      const response = await api().get(`/api/cryptocurrencies/${MISSING_ID}/prices`);

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: { message: `Cryptocurrency with id ${MISSING_ID} not found` } });
    });

    it('GetHistory_ShouldReturn400_WhenIdIsNotUuid', async () => {
      const response = await api().get('/api/cryptocurrencies/123/prices');

      expect(response.status).toBe(400);
      expect(response.body.error.details).toEqual([{ field: 'id', message: 'must be a valid UUID' }]);
    });

    it.each([
      ['LimitIsZero', { limit: '0' }, 'limit'],
      ['LimitIsNegative', { limit: '-1' }, 'limit'],
      ['LimitIsAboveMaximum', { limit: '1001' }, 'limit'],
      ['LimitIsNotANumber', { limit: 'abc' }, 'limit'],
      ['LimitIsFractional', { limit: '1.5' }, 'limit'],
      ['OffsetIsNegative', { offset: '-1' }, 'offset'],
      ['OffsetIsNotANumber', { offset: 'abc' }, 'offset'],
      ['FromIsNotADate', { from: 'yesterday' }, 'from'],
      ['FromIsImpossibleDate', { from: '2026-13-45T00:00:00Z' }, 'from'],
      ['FromIsFebruary30', { from: '2026-02-30T00:00:00Z' }, 'from'],
      ['FromIsFebruary29InNonLeapYear', { from: '2026-02-29' }, 'from'],
      ['FromIsApril31', { from: '2026-04-31T12:00:00+03:00' }, 'from'],
      ['ToIsJune31', { to: '2026-06-31' }, 'to'],
      ['FromHasHour25', { from: '2026-10-01T25:00:00Z' }, 'from'],
      ['FromHasMinute60', { from: '2026-10-01T10:60:00Z' }, 'from'],
      ['FromHasImpossibleTimeZone', { from: '2026-10-01T10:00:00+25:00' }, 'from'],
      ['FromHasTimeWithoutTimeZone', { from: '2026-10-02T10:00:00' }, 'from'],
      ['ToIsNotADate', { to: '02.10.2026' }, 'to'],
      ['FromIsLaterThanTo', { from: DAY_3, to: DAY_1 }, 'from'],
      ['ParameterIsUnknown', { order: 'asc' }, 'order'],
    ])('GetHistory_ShouldReturn400_When%s', async (_case, query, field) => {
      const response = await api().get(`/api/cryptocurrencies/${bitcoinId}/prices`).query(query);

      expect(response.status).toBe(400);
      expect(response.body.error.details).toEqual([{ field, message: expect.any(String) }]);
    });

    it('GetHistory_ShouldReturn400_WhenParameterIsRepeated', async () => {
      const response = await api().get(`/api/cryptocurrencies/${bitcoinId}/prices?limit=1&limit=2`);

      expect(response.status).toBe(400);
      expect(response.body.error.details).toEqual([{ field: 'limit', message: expect.any(String) }]);
    });

    it('GetHistory_ShouldReturn401_WhenTokenIsMissing', async () => {
      const response = await request(app).get(`/api/cryptocurrencies/${bitcoinId}/prices`);

      expect(response.status).toBe(401);
    });
  });
});
