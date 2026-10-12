import fs from 'node:fs';
import path from 'node:path';
import type { Logger } from '../logger/logger';
import { runInTransaction, type Database } from './database';

const MIGRATIONS_DIR = path.resolve(__dirname, '../../migrations');

export function runMigrations(db: Database, logger: Logger, migrationsDir: string = MIGRATIONS_DIR): string[] {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    )
  `);

  const applied = new Set(
    db
      .prepare('SELECT name FROM schema_migrations')
      .all()
      .map((row) => String(row.name)),
  );

  const pending = fs
    .readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.sql') && !applied.has(file))
    .sort();

  for (const file of pending) {
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');

    runInTransaction(db, () => {
      db.exec(sql);
      db.prepare('INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)').run(
        file,
        new Date().toISOString(),
      );
    });

    logger.info('Migration applied', { migration: file });
  }

  return pending;
}
