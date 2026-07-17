import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { MIGRATIONS } from "./migrations/index.js";

export type Db = Database.Database;

/**
 * Opens (creating if necessary) the SQLite database at `path`, enables sane
 * pragmas, and runs any outstanding migrations. Passing `:memory:` yields an
 * ephemeral database (used by tests).
 */
export function openDatabase(path: string): Db {
  if (path !== ":memory:") {
    mkdirSync(dirname(path), { recursive: true });
  }

  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  runMigrations(db);
  return db;
}

/** Applies pending migrations idempotently, recording each in schema_migrations. */
export function runMigrations(db: Db): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      applied_at TEXT NOT NULL
    );
  `);

  const applied = new Set(
    db
      .prepare("SELECT name FROM schema_migrations")
      .all()
      .map((row) => (row as { name: string }).name),
  );

  const insert = db.prepare(
    "INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)",
  );

  for (const migration of MIGRATIONS) {
    if (applied.has(migration.name)) continue;
    const apply = db.transaction(() => {
      db.exec(migration.sql);
      insert.run(migration.name, new Date().toISOString());
    });
    apply();
  }
}
