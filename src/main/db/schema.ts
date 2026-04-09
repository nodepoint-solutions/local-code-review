import type Database from 'better-sqlite3'

export function applySchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS repositories (
      id         TEXT PRIMARY KEY,
      path       TEXT NOT NULL UNIQUE,
      name       TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS pull_requests (
      id             TEXT PRIMARY KEY,
      repo_id        TEXT NOT NULL REFERENCES repositories(id),
      title          TEXT NOT NULL,
      description    TEXT,
      base_branch    TEXT NOT NULL,
      compare_branch TEXT NOT NULL,
      base_sha       TEXT NOT NULL,
      compare_sha    TEXT NOT NULL,
      status         TEXT NOT NULL DEFAULT 'open',
      created_at     TEXT NOT NULL,
      updated_at     TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS reviews (
      id           TEXT PRIMARY KEY,
      pr_id        TEXT NOT NULL REFERENCES pull_requests(id),
      status       TEXT NOT NULL DEFAULT 'in_progress',
      submitted_at TEXT,
      created_at   TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS comments (
      id         TEXT PRIMARY KEY,
      review_id  TEXT NOT NULL REFERENCES reviews(id),
      file_path  TEXT NOT NULL,
      start_line INTEGER NOT NULL,
      end_line   INTEGER NOT NULL,
      side       TEXT NOT NULL DEFAULT 'right',
      body       TEXT NOT NULL,
      is_stale   INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS comment_context (
      id            TEXT PRIMARY KEY,
      comment_id    TEXT NOT NULL REFERENCES comments(id),
      context_lines TEXT NOT NULL
    );
  `)
}

export function runMigrations(db: Database.Database): void {
  // settings table
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `)

  // last_visited_at on repositories
  const hasCol = db
    .prepare(`SELECT COUNT(*) as count FROM pragma_table_info('repositories') WHERE name = 'last_visited_at'`)
    .get() as { count: number }
  if (hasCol.count === 0) {
    db.exec(`ALTER TABLE repositories ADD COLUMN last_visited_at TEXT;`)
  }
}
