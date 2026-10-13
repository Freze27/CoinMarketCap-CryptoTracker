import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { AppError, DatabaseError } from '../errors';
import type { Logger } from '../logger/logger';

export type Database = DatabaseSync;

export const IN_MEMORY_DATABASE = ':memory:';

export function openDatabase(databasePath: string): Database {
  if (databasePath !== IN_MEMORY_DATABASE) {
    fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  }

  return new DatabaseSync(databasePath);
}

export function isDatabaseAlive(db: Database, logger: Logger): boolean {
  try {
    db.prepare('SELECT 1').get();
    return true;
  } catch (error) {
    logger.error('Database health check failed', { error });
    return false;
  }
}

export function runInTransaction<T>(db: Database, operation: () => T): T {
  db.exec('BEGIN');

  try {
    const result = operation();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export function withDatabaseErrors<T>(operation: string, action: () => T): T {
  try {
    return action();
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    throw new DatabaseError(operation, error);
  }
}
