import type { Database } from '../../src/db/database';
import { createPriceSyncTask } from '../../src/jobs/price-sync.task';
import { TaskScheduler } from '../../src/jobs/task-scheduler';
import { SqliteCryptocurrencyRepository } from '../../src/modules/cryptocurrencies/sqlite-cryptocurrency.repository';
import { SqlitePriceHistoryRepository } from '../../src/modules/prices/sqlite-price-history.repository';
import type { Services } from '../../src/services';
import { cmcHttpError, cmcNetworkError, cmcQuotesResponse, createTestApp, quotesCalls } from '../helpers/app';

const INTERVAL = 300_000;

describe('price sync task', () => {
  let db: Database;
  let cmcGet: jest.Mock;
  let services: Services;
  let scheduler: TaskScheduler;
  let bitcoinId: string;
  let ethereumId: string;
  let consoleError: jest.SpyInstance;

  async function historyOf(cryptocurrencyId: string): Promise<number[]> {
    const records = await new SqlitePriceHistoryRepository(db).findHistory(cryptocurrencyId, { limit: 100, offset: 0 });
    return records.map((record) => record.price);
  }

  beforeEach(async () => {
    jest.useFakeTimers();
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    ({ db, cmcGet, services } = createTestApp({ cmcMaxRetries: 0 }));
    const cryptocurrencies = new SqliteCryptocurrencyRepository(db);
    bitcoinId = (await cryptocurrencies.create({ symbol: 'BTC', name: 'Bitcoin', cmcId: 1 })).id;
    ethereumId = (await cryptocurrencies.create({ symbol: 'ETH', name: 'Ethereum', cmcId: 1027 })).id;

    scheduler = new TaskScheduler([createPriceSyncTask(services.priceService, INTERVAL)]);
    scheduler.start();
  });

  afterEach(async () => {
    await scheduler.stop();
    jest.useRealTimers();
    jest.restoreAllMocks();
    db.close();
  });

  it('PriceSync_ShouldSavePricesOfAllCryptocurrenciesToHistory_WhenIntervalPasses', async () => {
    await jest.advanceTimersByTimeAsync(INTERVAL);

    await expect(historyOf(bitcoinId)).resolves.toEqual([65000.5]);
    await expect(historyOf(ethereumId)).resolves.toEqual([3200.25]);
    expect(quotesCalls(cmcGet)).toHaveLength(1);
  });

  it('PriceSync_ShouldNotRequestPrices_WhenIntervalHasNotPassed', async () => {
    await jest.advanceTimersByTimeAsync(INTERVAL - 1);

    expect(cmcGet).not.toHaveBeenCalled();
    await expect(historyOf(bitcoinId)).resolves.toEqual([]);
  });

  it('PriceSync_ShouldAppendNewPriceOnEveryRun_WhenSeveralIntervalsPass', async () => {
    cmcGet
      .mockResolvedValueOnce(cmcQuotesResponse({ 1: 100, 1027: 10 }))
      .mockResolvedValueOnce(cmcQuotesResponse({ 1: 200, 1027: 20 }))
      .mockResolvedValueOnce(cmcQuotesResponse({ 1: 300, 1027: 30 }));

    await jest.advanceTimersByTimeAsync(INTERVAL * 3);

    await expect(historyOf(bitcoinId)).resolves.toEqual([300, 200, 100]);
    await expect(historyOf(ethereumId)).resolves.toEqual([30, 20, 10]);
  });

  it('PriceSync_ShouldSetUpdateTimeOfCryptocurrency_WhenPricesAreSaved', async () => {
    const before = await new SqliteCryptocurrencyRepository(db).findById(bitcoinId);

    await jest.advanceTimersByTimeAsync(INTERVAL);

    const after = await new SqliteCryptocurrencyRepository(db).findById(bitcoinId);
    expect(Date.parse(after?.updatedAt ?? '')).toBeGreaterThan(Date.parse(before?.updatedAt ?? ''));
  });

  it.each([
    ['TimesOut', cmcNetworkError('ECONNABORTED')],
    ['RespondsWith500', cmcHttpError(500)],
    ['RespondsWith429', cmcHttpError(429)],
    ['RejectsApiKey', cmcHttpError(401)],
  ])('PriceSync_ShouldSaveNothingAndRunAgainOnNextInterval_WhenCoinMarketCap%s', async (_case, error) => {
    cmcGet.mockRejectedValueOnce(error);

    await jest.advanceTimersByTimeAsync(INTERVAL);

    await expect(historyOf(bitcoinId)).resolves.toEqual([]);
    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining('Task "price-sync" failed'),
      expect.objectContaining({ message: 'CoinMarketCap is unavailable' }),
    );
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain('test-cmc-key');

    await jest.advanceTimersByTimeAsync(INTERVAL);

    await expect(historyOf(bitcoinId)).resolves.toEqual([65000.5]);
  });

  it('PriceSync_ShouldSaveNothing_WhenCoinMarketCapReturnsUnexpectedResponse', async () => {
    cmcGet.mockResolvedValueOnce({ data: 'not json' });

    await jest.advanceTimersByTimeAsync(INTERVAL);

    await expect(historyOf(bitcoinId)).resolves.toEqual([]);
    expect(consoleError).toHaveBeenCalled();
  });

  it('PriceSync_ShouldSavePricesOfRemainingCryptocurrencies_WhenOneIsDeletedDuringRequest', async () => {
    cmcGet.mockImplementationOnce(async () => {
      await new SqliteCryptocurrencyRepository(db).delete(ethereumId);
      return cmcQuotesResponse({ 1: 65000.5, 1027: 3200.25 });
    });

    await jest.advanceTimersByTimeAsync(INTERVAL);

    await expect(historyOf(bitcoinId)).resolves.toEqual([65000.5]);
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('PriceSync_ShouldNotCallCoinMarketCap_WhenNothingIsTracked', async () => {
    const cryptocurrencies = new SqliteCryptocurrencyRepository(db);
    await cryptocurrencies.delete(bitcoinId);
    await cryptocurrencies.delete(ethereumId);

    await jest.advanceTimersByTimeAsync(INTERVAL);

    expect(cmcGet).not.toHaveBeenCalled();
  });

  it('PriceSync_ShouldStopRequestingPrices_WhenSchedulerIsStopped', async () => {
    await scheduler.stop();

    await jest.advanceTimersByTimeAsync(INTERVAL * 3);

    expect(cmcGet).not.toHaveBeenCalled();
  });
});
