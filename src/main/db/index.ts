// src/main/db/index.ts
import Database from 'better-sqlite3'
import { app } from 'electron'
import path from 'path'
import { applySchema } from './schema'

let _db: Database.Database | null = null

function getNativeBinding(): string {
  const relPath = path.join('node_modules', 'better-sqlite3', 'build', 'Release', 'better_sqlite3.node')
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'app.asar.unpacked', relPath)
  }
  return path.join(app.getAppPath(), relPath)
}

export function getDb(): Database.Database {
  if (_db) return _db
  const dbPath = path.join(app.getPath('userData'), 'pr-reviewer.sqlite')

  _db = new Database(dbPath, { nativeBinding: getNativeBinding() })
  _db.pragma('journal_mode = WAL')
  _db.pragma('foreign_keys = ON')
  applySchema(_db)
  return _db
}
