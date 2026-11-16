/**
 * Database bootstrap. The app database lives in the Electron userData
 * directory (path injected by the caller); tests use `:memory:`.
 */

import Database from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as schema from './schema'

export type Db = BetterSQLite3Database<typeof schema>

const migrationsFolder = join(dirname(fileURLToPath(import.meta.url)), '..', 'drizzle')

export interface DatabaseHandle {
  db: Db
  /** Raw better-sqlite3 handle for pragmas/backups; prefer `db` for queries. */
  sqlite: Database.Database
  close(): void
}

export function createDatabase(path: string): DatabaseHandle {
  if (path !== ':memory:') {
    mkdirSync(dirname(path), { recursive: true })
  }
  const sqlite = new Database(path)
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')
  const db = drizzle(sqlite, { schema })
  if (existsSync(migrationsFolder)) {
    migrate(db, { migrationsFolder })
  } else {
    throw new Error(`migrations folder not found: ${migrationsFolder}`)
  }
  return { db, sqlite, close: () => sqlite.close() }
}
