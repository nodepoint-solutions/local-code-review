// src/main/db/schema.ts
import type Database from 'better-sqlite3'

export function applySchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS repositories (
      id               TEXT PRIMARY KEY,
      path             TEXT NOT NULL UNIQUE,
      name             TEXT NOT NULL,
      created_at       TEXT NOT NULL,
      last_visited_at  TEXT
    );
    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS removed_repositories (
      path        TEXT PRIMARY KEY,
      removed_at  TEXT NOT NULL
    );
  `)
}
