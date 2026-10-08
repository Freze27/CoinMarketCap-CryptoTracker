import { runInTransaction, withDatabaseErrors, type Database } from '../../db/database';
import type {
  NewPriceRecord,
  PriceHistoryFilter,
  PriceHistoryRepository,
  PriceRecord,
} from './price-history.repository';

interface PriceRow {
  id: number;
  cryptocurrency_id: string;
  price: number;
  fetched_at: string;
}

const COLUMNS = 'id, cryptocurrency_id, price, fetched_at';
const EARLIEST_DATE = '';
const LATEST_DATE = '9999-12-31T23:59:59.999Z';

function toPriceRecord(row: PriceRow): PriceRecord {
  return {
    id: row.id,
    cryptocurrencyId: row.cryptocurrency_id,
    price: row.price,
    fetchedAt: row.fetched_at,
  };
}

export class SqlitePriceHistoryRepository implements PriceHistoryRepository {
  private readonly insertStatement;
  private readonly touchCryptocurrencyStatement;
  private readonly findLatestStatement;
  private readonly findLatestForAllStatement;
  private readonly findHistoryStatement;

  constructor(private readonly db: Database) {
    this.insertStatement = db.prepare(`
      INSERT INTO price_history (cryptocurrency_id, price, fetched_at)
      SELECT :cryptocurrencyId, :price, :fetchedAt
      WHERE EXISTS (SELECT 1 FROM cryptocurrencies WHERE id = :cryptocurrencyId)
    `);
    this.touchCryptocurrencyStatement = db.prepare(`
      UPDATE cryptocurrencies
      SET updated_at = :fetchedAt
      WHERE id = :cryptocurrencyId AND updated_at < :fetchedAt
    `);
    this.findLatestStatement = db.prepare(`
      SELECT ${COLUMNS}
      FROM price_history
      WHERE cryptocurrency_id = ?
      ORDER BY fetched_at DESC, id DESC
      LIMIT 1
    `);
    this.findLatestForAllStatement = db.prepare(`
      SELECT price.id, price.cryptocurrency_id, price.price, price.fetched_at
      FROM cryptocurrencies AS cryptocurrency
      JOIN price_history AS price ON price.id = (
        SELECT id
        FROM price_history
        WHERE cryptocurrency_id = cryptocurrency.id
        ORDER BY fetched_at DESC, id DESC
        LIMIT 1
      )
      ORDER BY cryptocurrency.symbol
    `);
    this.findHistoryStatement = db.prepare(`
      SELECT ${COLUMNS}
      FROM price_history
      WHERE cryptocurrency_id = :cryptocurrencyId
        AND fetched_at >= :from
        AND fetched_at <= :to
      ORDER BY fetched_at DESC, id DESC
      LIMIT :limit OFFSET :offset
    `);
  }

  async addMany(records: NewPriceRecord[]): Promise<number> {
    return withDatabaseErrors('priceHistory.addMany', () =>
      runInTransaction(this.db, () => {
        let saved = 0;

        for (const record of records) {
          const { changes } = this.insertStatement.run({
            cryptocurrencyId: record.cryptocurrencyId,
            price: record.price,
            fetchedAt: record.fetchedAt,
          });

          if (changes === 0) {
            continue;
          }

          saved += 1;
          this.touchCryptocurrencyStatement.run({
            cryptocurrencyId: record.cryptocurrencyId,
            fetchedAt: record.fetchedAt,
          });
        }

        return saved;
      }),
    );
  }

  async findLatest(cryptocurrencyId: string): Promise<PriceRecord | null> {
    return withDatabaseErrors('priceHistory.findLatest', () => {
      const row = this.findLatestStatement.get(cryptocurrencyId) as unknown as PriceRow | undefined;
      return row ? toPriceRecord(row) : null;
    });
  }

  async findLatestForAll(): Promise<PriceRecord[]> {
    return withDatabaseErrors('priceHistory.findLatestForAll', () => {
      const rows = this.findLatestForAllStatement.all() as unknown as PriceRow[];
      return rows.map(toPriceRecord);
    });
  }

  async findHistory(cryptocurrencyId: string, filter: PriceHistoryFilter): Promise<PriceRecord[]> {
    return withDatabaseErrors('priceHistory.findHistory', () => {
      const rows = this.findHistoryStatement.all({
        cryptocurrencyId,
        from: filter.from ?? EARLIEST_DATE,
        to: filter.to ?? LATEST_DATE,
        limit: filter.limit,
        offset: filter.offset,
      }) as unknown as PriceRow[];

      return rows.map(toPriceRecord);
    });
  }
}
