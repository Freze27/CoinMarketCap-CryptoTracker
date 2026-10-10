export interface Cryptocurrency {
  id: string;
  symbol: string;
  name: string;
  cmcId: number;
  updatedAt: string;
}

export interface CreateCryptocurrencyData {
  symbol: string;
  name: string;
  cmcId: number;
}

export interface UpdateCryptocurrencyData {
  name: string;
}

export interface CryptocurrencyRepository {
  findAll(): Promise<Cryptocurrency[]>;
  findById(id: string): Promise<Cryptocurrency | null>;
  findBySymbol(symbol: string): Promise<Cryptocurrency | null>;
  create(data: CreateCryptocurrencyData): Promise<Cryptocurrency>;
  update(id: string, data: UpdateCryptocurrencyData): Promise<Cryptocurrency | null>;
  delete(id: string): Promise<boolean>;
}
