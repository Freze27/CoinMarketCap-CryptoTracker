import { randomUUID } from 'node:crypto';
import { withDatabaseErrors, type Database } from '../../db/database';
import { ConflictError } from '../../errors';
import type {
  CreateCryptocurrencyData,
  Cryptocurrency,
  CryptocurrencyRepository,
  UpdateCryptocurrencyData,
} from './cryptocurrency.repository';

interface CryptocurrencyRow {
  id: string;
  symbol: string;
  name: string;
  updated_at: string;
}

const COLUMNS = 'id, symbol, name, updated_at';
const SQLITE_CONSTRAINT_UNIQUE = 2067;

function toCryptocurrency(row: CryptocurrencyRow): Cryptocurrency {
  return {
    id: row.id,
    symbol: row.symbol,
    name: row.name,
    updatedAt: row.updated_at,
  };
}

function isUniqueViolation(error: unknown): boolean {
  return (error as { errcode?: number } | null)?.errcode === SQLITE_CONSTRAINT_UNIQUE;
}

export class SqliteCryptocurrencyRepository implements CryptocurrencyRepository {
  private readonly findAllStatement;
  private readonly findByIdStatement;
  private readonly findBySymbolStatement;
  private readonly createStatement;
  private readonly updateStatement;
  private readonly deleteStatement;

  constructor(db: Database) {
    this.findAllStatement = db.prepare(`SELECT ${COLUMNS} FROM cryptocurrencies ORDER BY symbol`);
    this.findByIdStatement = db.prepare(`SELECT ${COLUMNS} FROM cryptocurrencies WHERE id = ?`);
    this.findBySymbolStatement = db.prepare(`SELECT ${COLUMNS} FROM cryptocurrencies WHERE symbol = ?`);
    this.createStatement = db.prepare(`
      INSERT INTO cryptocurrencies (id, symbol, name, updated_at)
      VALUES (:id, :symbol, :name, :updatedAt)
      RETURNING ${COLUMNS}
    `);
    this.updateStatement = db.prepare(`
      UPDATE cryptocurrencies
      SET name = :name, updated_at = :updatedAt
      WHERE id = :id
      RETURNING ${COLUMNS}
    `);
    this.deleteStatement = db.prepare('DELETE FROM cryptocurrencies WHERE id = ?');
  }

  async findAll(): Promise<Cryptocurrency[]> {
    return withDatabaseErrors('cryptocurrencies.findAll', () => {
      const rows = this.findAllStatement.all() as unknown as CryptocurrencyRow[];
      return rows.map(toCryptocurrency);
    });
  }

  async findById(id: string): Promise<Cryptocurrency | null> {
    return withDatabaseErrors('cryptocurrencies.findById', () => {
      const row = this.findByIdStatement.get(id) as unknown as CryptocurrencyRow | undefined;
      return row ? toCryptocurrency(row) : null;
    });
  }

  async findBySymbol(symbol: string): Promise<Cryptocurrency | null> {
    return withDatabaseErrors('cryptocurrencies.findBySymbol', () => {
      const row = this.findBySymbolStatement.get(symbol) as unknown as CryptocurrencyRow | undefined;
      return row ? toCryptocurrency(row) : null;
    });
  }

  async create(data: CreateCryptocurrencyData): Promise<Cryptocurrency> {
    return withDatabaseErrors('cryptocurrencies.create', () => {
      try {
        const row = this.createStatement.get({
          id: randomUUID(),
          symbol: data.symbol,
          name: data.name,
          updatedAt: new Date().toISOString(),
        }) as unknown as CryptocurrencyRow;

        return toCryptocurrency(row);
      } catch (error) {
        throw this.toConflictError(error, data.symbol);
      }
    });
  }

  async update(id: string, data: UpdateCryptocurrencyData): Promise<Cryptocurrency | null> {
    return withDatabaseErrors('cryptocurrencies.update', () => {
      const row = this.updateStatement.get({
        id,
        name: data.name,
        updatedAt: new Date().toISOString(),
      }) as unknown as CryptocurrencyRow | undefined;

      return row ? toCryptocurrency(row) : null;
    });
  }

  async delete(id: string): Promise<boolean> {
    return withDatabaseErrors('cryptocurrencies.delete', () => this.deleteStatement.run(id).changes > 0);
  }

  private toConflictError(error: unknown, symbol: string): unknown {
    if (isUniqueViolation(error)) {
      return new ConflictError(`Cryptocurrency with symbol "${symbol}" already exists`, { symbol });
    }

    return error;
  }
}
