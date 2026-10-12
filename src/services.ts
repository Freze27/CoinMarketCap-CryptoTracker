import type { MarketDataProvider } from './clients/market-data-provider';
import type { Database } from './db/database';
import { CryptocurrencyService } from './modules/cryptocurrencies/cryptocurrency.service';
import { SqliteCryptocurrencyRepository } from './modules/cryptocurrencies/sqlite-cryptocurrency.repository';
import { PriceService } from './modules/prices/price.service';
import { SqlitePriceHistoryRepository } from './modules/prices/sqlite-price-history.repository';

interface ServiceDependencies {
  db: Database;
  marketData: MarketDataProvider;
  priceCacheTtlMs: number;
}

export interface Services {
  cryptocurrencyService: CryptocurrencyService;
  priceService: PriceService;
}

export function createServices({ db, marketData, priceCacheTtlMs }: ServiceDependencies): Services {
  const cryptocurrencyRepository = new SqliteCryptocurrencyRepository(db);
  const priceHistoryRepository = new SqlitePriceHistoryRepository(db);

  return {
    cryptocurrencyService: new CryptocurrencyService(cryptocurrencyRepository, marketData),
    priceService: new PriceService(cryptocurrencyRepository, priceHistoryRepository, marketData, priceCacheTtlMs),
  };
}
