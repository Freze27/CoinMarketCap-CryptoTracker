export interface MarketCoin {
  cmcId: number;
  symbol: string;
  name: string;
}

export interface MarketDataProvider {
  findCoinBySymbol(symbol: string): Promise<MarketCoin | null>;
  getLatestPrices(cmcIds: number[]): Promise<Map<number, number>>;
}
