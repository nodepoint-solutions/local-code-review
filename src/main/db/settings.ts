import type Database from 'better-sqlite3'

export function getSetting(db: Database.Database, key: string): string | null {
  const row = db
    .prepare('SELECT value FROM settings WHERE key = ?')
    .get(key) as { value: string } | undefined
  return row?.value ?? null
}

export function setSetting(db: Database.Database, key: string, value: string): void {
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run(key, value)
}

export function resetAllData(db: Database.Database): void {
  db.exec(`
    DELETE FROM comment_context;
    DELETE FROM comments;
    DELETE FROM reviews;
    DELETE FROM pull_requests;
    DELETE FROM repositories;
    DELETE FROM settings;
  `)
}
