import { IN_MEMORY_DATABASE, openDatabase, type Database } from '../../src/db/database';
import { runMigrations } from '../../src/db/migrate';
import { createLogger } from '../../src/logger/logger';

export function createTestDatabase(): Database {
  const db = openDatabase(IN_MEMORY_DATABASE);
  runMigrations(db, createLogger('silent'));
  return db;
}
