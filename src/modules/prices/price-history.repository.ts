export interface PriceRecord {
  id: number;
  cryptocurrencyId: string;
  price: number;
  fetchedAt: string;
}

export interface NewPriceRecord {
  cryptocurrencyId: string;
  price: number;
  fetchedAt: string;
}

export interface PriceHistoryFilter {
  from?: string;
  to?: string;
  limit: number;
  offset: number;
}

export interface PriceHistoryRepository {
  addMany(records: NewPriceRecord[]): Promise<number>;
  findLatest(cryptocurrencyId: string): Promise<PriceRecord | null>;
  findLatestForAll(): Promise<PriceRecord[]>;
  findHistory(cryptocurrencyId: string, filter: PriceHistoryFilter): Promise<PriceRecord[]>;
}
