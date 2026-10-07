import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export type Database = DatabaseSync;

export function openDatabase(databasePath: string): Database {
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  return new DatabaseSync(databasePath);
}

export function isDatabaseAlive(db: Database): boolean {
  try {
    db.prepare('SELECT 1').get();
    return true;
  } catch (error) {
    console.error('Database health check failed:', error);
    return false;
  }
}
