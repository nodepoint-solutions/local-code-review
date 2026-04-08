import Database from 'better-sqlite3'
import { app } from 'electron'
import path from 'path'
import { applySchema } from './schema'

let _db: Database.Database | null = null

export function getDb(): Database.Database {
  if (_db) return _db
  const dbPath = path.join(app.getPath('userData'), 'pr-reviewer.sqlite')
  _db = new Database(dbPath)
  _db.pragma('journal_mode = WAL')
  _db.pragma('foreign_keys = ON')
  applySchema(_db)
  return _db
}
