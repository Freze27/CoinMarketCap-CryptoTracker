import type { MarketDataProvider } from '../../clients/market-data-provider';
import { CryptocurrencyNotFoundError, ValidationError } from '../../errors';
import type {
  Cryptocurrency,
  CryptocurrencyRepository,
  UpdateCryptocurrencyData,
} from './cryptocurrency.repository';

export interface CreateCryptocurrencyInput {
  symbol: string;
  name: string;
}

export class CryptocurrencyService {
  constructor(
    private readonly repository: CryptocurrencyRepository,
    private readonly marketData: MarketDataProvider,
  ) {}

  async getAll(): Promise<Cryptocurrency[]> {
    return this.repository.findAll();
  }

  async getById(id: string): Promise<Cryptocurrency> {
    const cryptocurrency = await this.repository.findById(id);

    if (!cryptocurrency) {
      throw new CryptocurrencyNotFoundError(id);
    }

    return cryptocurrency;
  }

  async create(input: CreateCryptocurrencyInput): Promise<Cryptocurrency> {
    const symbol = input.symbol.toUpperCase();
    const coin = await this.marketData.findCoinBySymbol(symbol);

    if (!coin) {
      throw new ValidationError([{ field: 'symbol', message: 'is not listed on CoinMarketCap' }]);
    }

    return this.repository.create({ symbol, name: input.name, cmcId: coin.cmcId });
  }

  async update(id: string, data: UpdateCryptocurrencyData): Promise<Cryptocurrency> {
    const cryptocurrency = await this.repository.update(id, data);

    if (!cryptocurrency) {
      throw new CryptocurrencyNotFoundError(id);
    }

    return cryptocurrency;
  }

  async delete(id: string): Promise<void> {
    const deleted = await this.repository.delete(id);

    if (!deleted) {
      throw new CryptocurrencyNotFoundError(id);
    }
  }
}
