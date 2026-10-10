import type { Database } from '../../src/db/database';
import { ConflictError, DatabaseError } from '../../src/errors';
import type { CryptocurrencyRepository } from '../../src/modules/cryptocurrencies/cryptocurrency.repository';
import { SqliteCryptocurrencyRepository } from '../../src/modules/cryptocurrencies/sqlite-cryptocurrency.repository';
import { createTestDatabase } from '../helpers/database';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const MISSING_ID = '00000000-0000-4000-8000-000000000000';

describe('SqliteCryptocurrencyRepository', () => {
  let db: Database;
  let repository: CryptocurrencyRepository;

  beforeEach(() => {
    db = createTestDatabase();
    repository = new SqliteCryptocurrencyRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('create', () => {
    it('Create_ShouldReturnSavedCryptocurrency_WhenSymbolIsNew', async () => {
      const created = await repository.create({ symbol: 'BTC', name: 'Bitcoin', cmcId: 1 });

      expect(created).toEqual({
        id: expect.stringMatching(UUID_PATTERN),
        symbol: 'BTC',
        name: 'Bitcoin',
        cmcId: 1,
        updatedAt: expect.any(String),
      });
      expect(new Date(created.updatedAt).toISOString()).toBe(created.updatedAt);
    });

    it('Create_ShouldThrowConflictError_WhenSymbolAlreadyExists', async () => {
      await repository.create({ symbol: 'BTC', name: 'Bitcoin', cmcId: 1 });

      const duplicate = repository.create({ symbol: 'BTC', name: 'Another Bitcoin', cmcId: 1 });

      await expect(duplicate).rejects.toBeInstanceOf(ConflictError);
      await expect(duplicate).rejects.toMatchObject({ statusCode: 409, context: { symbol: 'BTC' } });
      await expect(repository.findAll()).resolves.toHaveLength(1);
    });

    it('Create_ShouldSaveNameAsPlainText_WhenNameContainsSql', async () => {
      const name = "Bitcoin'); DROP TABLE cryptocurrencies; --";

      const created = await repository.create({ symbol: 'BTC', name, cmcId: 1 });

      await expect(repository.findById(created.id)).resolves.toMatchObject({ name });
    });
  });

  describe('findAll', () => {
    it('FindAll_ShouldReturnEmptyList_WhenNoCryptocurrenciesExist', async () => {
      await expect(repository.findAll()).resolves.toEqual([]);
    });

    it('FindAll_ShouldReturnAllSortedBySymbol_WhenSeveralCryptocurrenciesExist', async () => {
      await repository.create({ symbol: 'SOL', name: 'Solana', cmcId: 5426 });
      await repository.create({ symbol: 'BTC', name: 'Bitcoin', cmcId: 1 });
      await repository.create({ symbol: 'ETH', name: 'Ethereum', cmcId: 1027 });

      const all = await repository.findAll();

      expect(all.map((item) => item.symbol)).toEqual(['BTC', 'ETH', 'SOL']);
    });
  });

  describe('findById', () => {
    it('FindById_ShouldReturnCryptocurrency_WhenIdExists', async () => {
      const created = await repository.create({ symbol: 'BTC', name: 'Bitcoin', cmcId: 1 });

      await expect(repository.findById(created.id)).resolves.toEqual(created);
    });

    it('FindById_ShouldReturnNull_WhenIdDoesNotExist', async () => {
      await expect(repository.findById(MISSING_ID)).resolves.toBeNull();
    });
  });

  describe('update', () => {
    it('Update_ShouldChangeNameAndKeepSymbol_WhenIdExists', async () => {
      const created = await repository.create({ symbol: 'BTC', name: 'Bitcoin', cmcId: 1 });

      const updated = await repository.update(created.id, { name: 'Bitcoin Core' });

      expect(updated).toMatchObject({ id: created.id, symbol: 'BTC', name: 'Bitcoin Core' });
      await expect(repository.findById(created.id)).resolves.toEqual(updated);
    });

    it('Update_ShouldReturnNull_WhenIdDoesNotExist', async () => {
      await expect(repository.update(MISSING_ID, { name: 'Nothing' })).resolves.toBeNull();
    });
  });

  describe('delete', () => {
    it('Delete_ShouldRemoveCryptocurrencyAndReturnTrue_WhenIdExists', async () => {
      const created = await repository.create({ symbol: 'BTC', name: 'Bitcoin', cmcId: 1 });

      await expect(repository.delete(created.id)).resolves.toBe(true);
      await expect(repository.findById(created.id)).resolves.toBeNull();
    });

    it('Delete_ShouldReturnFalse_WhenIdDoesNotExist', async () => {
      await expect(repository.delete(MISSING_ID)).resolves.toBe(false);
    });
  });

  it('FindAll_ShouldThrowDatabaseError_WhenDatabaseIsClosed', async () => {
    const closedDb = createTestDatabase();
    const closedRepository = new SqliteCryptocurrencyRepository(closedDb);
    closedDb.close();

    const result = closedRepository.findAll();

    await expect(result).rejects.toBeInstanceOf(DatabaseError);
    await expect(result).rejects.toMatchObject({
      statusCode: 500,
      message: 'Database operation failed: cryptocurrencies.findAll',
    });
  });
});
