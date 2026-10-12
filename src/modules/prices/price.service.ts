import type { MarketDataProvider } from '../../clients/market-data-provider';
import { CryptocurrencyNotFoundError, ExternalApiError } from '../../errors';
import type { Logger } from '../../logger/logger';
import type { Cryptocurrency, CryptocurrencyRepository } from '../cryptocurrencies/cryptocurrency.repository';
import type { PriceHistoryFilter, PriceHistoryRepository, PriceRecord } from './price-history.repository';

export interface LatestPrice {
  cryptocurrencyId: string;
  symbol: string;
  name: string;
  price: number | null;
  fetchedAt: string | null;
}

export interface LatestPrices {
  prices: LatestPrice[];
  stale: boolean;
}

export class PriceService {
  private refreshInProgress: Promise<number> | null = null;

  constructor(
    private readonly cryptocurrencies: CryptocurrencyRepository,
    private readonly priceHistory: PriceHistoryRepository,
    private readonly marketData: MarketDataProvider,
    private readonly cacheTtlMs: number,
    private readonly logger: Logger,
  ) {}

  async getLatestPrices(): Promise<LatestPrices> {
    const cryptocurrencies = await this.cryptocurrencies.findAll();
    let records = await this.priceHistory.findLatestForAll();
    let stale = false;

    if (!this.isFresh(cryptocurrencies, records)) {
      try {
        await this.refreshPrices();
        records = await this.priceHistory.findLatestForAll();
      } catch (error) {
        if (!(error instanceof ExternalApiError) || records.length === 0) {
          throw error;
        }

        this.logger.warn('Failed to refresh prices, serving stored prices', { error });
        stale = true;
      }
    }

    return { prices: this.toLatestPrices(cryptocurrencies, records), stale };
  }

  refreshPrices(): Promise<number> {
    this.refreshInProgress ??= this.fetchAndSavePrices().finally(() => {
      this.refreshInProgress = null;
    });

    return this.refreshInProgress;
  }

  private async fetchAndSavePrices(): Promise<number> {
    const cryptocurrencies = await this.cryptocurrencies.findAll();
    const prices = await this.marketData.getLatestPrices(cryptocurrencies.map((item) => item.cmcId));
    const fetchedAt = new Date().toISOString();

    const records = cryptocurrencies.flatMap((item) => {
      const price = prices.get(item.cmcId);
      return price === undefined ? [] : [{ cryptocurrencyId: item.id, price, fetchedAt }];
    });

    const savedPrices = await this.priceHistory.addMany(records);
    this.logger.info('Prices refreshed', { tracked: cryptocurrencies.length, savedPrices });

    return savedPrices;
  }

  async getHistory(cryptocurrencyId: string, filter: PriceHistoryFilter): Promise<PriceRecord[]> {
    const cryptocurrency = await this.cryptocurrencies.findById(cryptocurrencyId);

    if (!cryptocurrency) {
      throw new CryptocurrencyNotFoundError(cryptocurrencyId);
    }

    return this.priceHistory.findHistory(cryptocurrencyId, filter);
  }

  private isFresh(cryptocurrencies: Cryptocurrency[], records: PriceRecord[]): boolean {
    const oldestAllowed = new Date(Date.now() - this.cacheTtlMs).toISOString();
    const freshIds = new Set(
      records.filter((record) => record.fetchedAt >= oldestAllowed).map((record) => record.cryptocurrencyId),
    );

    return cryptocurrencies.every((item) => freshIds.has(item.id));
  }

  private toLatestPrices(cryptocurrencies: Cryptocurrency[], records: PriceRecord[]): LatestPrice[] {
    const byCryptocurrencyId = new Map(records.map((record) => [record.cryptocurrencyId, record]));

    return cryptocurrencies.map((item) => {
      const record = byCryptocurrencyId.get(item.id);

      return {
        cryptocurrencyId: item.id,
        symbol: item.symbol,
        name: item.name,
        price: record?.price ?? null,
        fetchedAt: record?.fetchedAt ?? null,
      };
    });
  }
}
