import type { Database } from '../../src/db/database';
import { DatabaseError } from '../../src/errors';
import type { CryptocurrencyRepository } from '../../src/modules/cryptocurrencies/cryptocurrency.repository';
import { SqliteCryptocurrencyRepository } from '../../src/modules/cryptocurrencies/sqlite-cryptocurrency.repository';
import type { PriceHistoryRepository } from '../../src/modules/prices/price-history.repository';
import { SqlitePriceHistoryRepository } from '../../src/modules/prices/sqlite-price-history.repository';
import { createTestDatabase } from '../helpers/database';

const DAY_1 = '2026-10-01T10:00:00.000Z';
const DAY_2 = '2026-10-02T10:00:00.000Z';
const DAY_3 = '2026-10-03T10:00:00.000Z';

describe('SqlitePriceHistoryRepository', () => {
  let db: Database;
  let cryptocurrencies: CryptocurrencyRepository;
  let prices: PriceHistoryRepository;
  let bitcoinId: string;
  let ethereumId: string;

  beforeEach(async () => {
    db = createTestDatabase();
    cryptocurrencies = new SqliteCryptocurrencyRepository(db);
    prices = new SqlitePriceHistoryRepository(db);
    bitcoinId = (await cryptocurrencies.create({ symbol: 'BTC', name: 'Bitcoin' })).id;
    ethereumId = (await cryptocurrencies.create({ symbol: 'ETH', name: 'Ethereum' })).id;
  });

  afterEach(() => {
    db.close();
  });

  describe('addMany', () => {
    it('AddMany_ShouldSavePricesAndMoveUpdateTimeForward_WhenPricesAreNewerThanLastUpdate', async () => {
      const fetchedAt = new Date(Date.now() + 60_000).toISOString();

      await prices.addMany([
        { cryptocurrencyId: bitcoinId, price: 65000.5, fetchedAt },
        { cryptocurrencyId: ethereumId, price: 3200.25, fetchedAt },
      ]);

      await expect(prices.findLatest(bitcoinId)).resolves.toEqual({
        id: expect.any(Number),
        cryptocurrencyId: bitcoinId,
        price: 65000.5,
        fetchedAt,
      });
      await expect(prices.findLatest(ethereumId)).resolves.toMatchObject({ price: 3200.25 });
      await expect(cryptocurrencies.findById(bitcoinId)).resolves.toMatchObject({ updatedAt: fetchedAt });
    });

    it('AddMany_ShouldSavePriceAndKeepUpdateTime_WhenPriceIsOlderThanLastUpdate', async () => {
      const before = await cryptocurrencies.findById(bitcoinId);

      await prices.addMany([{ cryptocurrencyId: bitcoinId, price: 65000, fetchedAt: DAY_1 }]);

      await expect(prices.findLatest(bitcoinId)).resolves.toMatchObject({ fetchedAt: DAY_1 });
      await expect(cryptocurrencies.findById(bitcoinId)).resolves.toEqual(before);
    });

    it('AddMany_ShouldReturnNumberOfSavedRecords_WhenAllCryptocurrenciesAreTracked', async () => {
      const saved = await prices.addMany([
        { cryptocurrencyId: bitcoinId, price: 1, fetchedAt: DAY_1 },
        { cryptocurrencyId: bitcoinId, price: 2, fetchedAt: DAY_2 },
        { cryptocurrencyId: ethereumId, price: 100, fetchedAt: DAY_1 },
      ]);

      expect(saved).toBe(3);
    });

    it('AddMany_ShouldSkipItAndSaveTheRest_WhenOneCryptocurrencyIsDeleted', async () => {
      const solana = await cryptocurrencies.create({ symbol: 'SOL', name: 'Solana' });
      await cryptocurrencies.delete(solana.id);

      const saved = await prices.addMany([
        { cryptocurrencyId: bitcoinId, price: 65000, fetchedAt: DAY_1 },
        { cryptocurrencyId: solana.id, price: 150, fetchedAt: DAY_1 },
        { cryptocurrencyId: ethereumId, price: 3200, fetchedAt: DAY_1 },
      ]);

      expect(saved).toBe(2);
      await expect(prices.findLatest(bitcoinId)).resolves.toMatchObject({ price: 65000 });
      await expect(prices.findLatest(ethereumId)).resolves.toMatchObject({ price: 3200 });
      await expect(prices.findLatest(solana.id)).resolves.toBeNull();
    });

    it('AddMany_ShouldThrowDatabaseErrorAndSaveNothing_WhenOneRecordHasNoPrice', async () => {
      const before = await cryptocurrencies.findById(bitcoinId);

      const result = prices.addMany([
        { cryptocurrencyId: bitcoinId, price: 65000, fetchedAt: DAY_1 },
        { cryptocurrencyId: ethereumId, price: null as unknown as number, fetchedAt: DAY_1 },
      ]);

      await expect(result).rejects.toBeInstanceOf(DatabaseError);
      await expect(result).rejects.toMatchObject({
        statusCode: 500,
        message: 'Database operation failed: priceHistory.addMany',
        context: { operation: 'priceHistory.addMany' },
        cause: expect.objectContaining({ message: 'NOT NULL constraint failed: price_history.price' }),
      });

      await expect(prices.findLatest(bitcoinId)).resolves.toBeNull();
      await expect(cryptocurrencies.findById(bitcoinId)).resolves.toEqual(before);
    });
  });

  describe('findLatest', () => {
    it('FindLatest_ShouldReturnMostRecentPrice_WhenSeveralPricesExist', async () => {
      await prices.addMany([
        { cryptocurrencyId: bitcoinId, price: 1, fetchedAt: DAY_2 },
        { cryptocurrencyId: bitcoinId, price: 2, fetchedAt: DAY_3 },
        { cryptocurrencyId: bitcoinId, price: 3, fetchedAt: DAY_1 },
      ]);

      await expect(prices.findLatest(bitcoinId)).resolves.toMatchObject({ price: 2, fetchedAt: DAY_3 });
    });

    it('FindLatest_ShouldReturnNull_WhenNoPricesExist', async () => {
      await expect(prices.findLatest(bitcoinId)).resolves.toBeNull();
    });
  });

  describe('findLatestForAll', () => {
    it('FindLatestForAll_ShouldReturnMostRecentPriceOfEach_WhenSomeCryptocurrenciesHavePrices', async () => {
      await cryptocurrencies.create({ symbol: 'SOL', name: 'Solana' });
      await prices.addMany([
        { cryptocurrencyId: bitcoinId, price: 1, fetchedAt: DAY_1 },
        { cryptocurrencyId: bitcoinId, price: 2, fetchedAt: DAY_3 },
        { cryptocurrencyId: bitcoinId, price: 3, fetchedAt: DAY_2 },
        { cryptocurrencyId: ethereumId, price: 100, fetchedAt: DAY_1 },
        { cryptocurrencyId: ethereumId, price: 200, fetchedAt: DAY_2 },
      ]);

      const latest = await prices.findLatestForAll();

      expect(latest).toEqual([
        { id: expect.any(Number), cryptocurrencyId: bitcoinId, price: 2, fetchedAt: DAY_3 },
        { id: expect.any(Number), cryptocurrencyId: ethereumId, price: 200, fetchedAt: DAY_2 },
      ]);
    });

    it('FindLatestForAll_ShouldReturnEmptyList_WhenNoPricesExist', async () => {
      await expect(prices.findLatestForAll()).resolves.toEqual([]);
    });
  });

  describe('findHistory', () => {
    beforeEach(async () => {
      await prices.addMany([
        { cryptocurrencyId: bitcoinId, price: 1, fetchedAt: DAY_1 },
        { cryptocurrencyId: bitcoinId, price: 2, fetchedAt: DAY_2 },
        { cryptocurrencyId: bitcoinId, price: 3, fetchedAt: DAY_3 },
        { cryptocurrencyId: ethereumId, price: 100, fetchedAt: DAY_2 },
      ]);
    });

    it('FindHistory_ShouldReturnPricesNewestFirst_WhenPeriodIsNotSet', async () => {
      const history = await prices.findHistory(bitcoinId, { limit: 10, offset: 0 });

      expect(history.map((record) => record.price)).toEqual([3, 2, 1]);
    });

    it('FindHistory_ShouldReturnPricesInsidePeriodInclusive_WhenBothBoundariesAreSet', async () => {
      const history = await prices.findHistory(bitcoinId, { from: DAY_2, to: DAY_3, limit: 10, offset: 0 });

      expect(history.map((record) => record.price)).toEqual([3, 2]);
    });

    it('FindHistory_ShouldReturnPricesFromOrUntilBoundary_WhenOneBoundaryIsSet', async () => {
      const since = await prices.findHistory(bitcoinId, { from: DAY_2, limit: 10, offset: 0 });
      const until = await prices.findHistory(bitcoinId, { to: DAY_2, limit: 10, offset: 0 });

      expect(since.map((record) => record.price)).toEqual([3, 2]);
      expect(until.map((record) => record.price)).toEqual([2, 1]);
    });

    it('FindHistory_ShouldReturnRequestedPage_WhenLimitAndOffsetAreSet', async () => {
      const history = await prices.findHistory(bitcoinId, { limit: 1, offset: 1 });

      expect(history.map((record) => record.price)).toEqual([2]);
    });

    it('FindHistory_ShouldReturnEmptyList_WhenCryptocurrencyHasNoPrices', async () => {
      const solana = await cryptocurrencies.create({ symbol: 'SOL', name: 'Solana' });

      await expect(prices.findHistory(solana.id, { limit: 10, offset: 0 })).resolves.toEqual([]);
    });
  });

  it('FindHistory_ShouldReturnEmptyListForItOnly_WhenCryptocurrencyIsDeleted', async () => {
    await prices.addMany([
      { cryptocurrencyId: bitcoinId, price: 1, fetchedAt: DAY_1 },
      { cryptocurrencyId: ethereumId, price: 100, fetchedAt: DAY_1 },
    ]);

    await cryptocurrencies.delete(bitcoinId);

    await expect(prices.findHistory(bitcoinId, { limit: 10, offset: 0 })).resolves.toEqual([]);
    await expect(prices.findHistory(ethereumId, { limit: 10, offset: 0 })).resolves.toHaveLength(1);
  });
});
