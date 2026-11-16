/**
 * Database bootstrap over Node's built-in `node:sqlite` — zero native
 * addons, identical behaviour under system Node (tests, CLI) and Electron
 * (both verified on Node 24 / Electron 44). Migrations are plain SQL files
 * in `migrations/`, applied in order and tracked in `schema_migrations`
 * (guide §7.3: FKs on, transactional writes, migration-managed schema).
 */

import { DatabaseSync, type SQLInputValue, type StatementResultingChanges } from 'node:sqlite'
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { nowIso } from '@cross-agent-sync/shared'

/**
 * Locate the SQL migrations folder across runtime layouts:
 *  - source/vitest: `<pkg>/src/..` → `<pkg>/migrations`
 *  - electron-vite dev bundle: `<app>/out/main` → up to repo root
 *  - packaged app: extraResources `migrations/` next to the asar
 */
function findMigrationsDir(): string {
  const here = dirname(fileURLToPath(import.meta.url))
  const candidates = [
    join(here, '..', 'migrations'), // source/vitest: <pkg>/src/..
    join(here, 'migrations'),
    // bundled MCP server: <root>/packages/mcp-server/dist → repo root
    join(here, '..', '..', '..', 'packages', 'database', 'migrations'),
    // packaged Electron app (resourcesPath is defined only under Electron)
    typeof process !== 'undefined' &&
    (process as unknown as { resourcesPath?: string }).resourcesPath
      ? join((process as unknown as { resourcesPath: string }).resourcesPath, 'migrations')
      : ''
  ].filter(Boolean)
  for (const c of candidates) {
    if (existsSync(c)) return c
  }
  throw new Error(`migrations folder not found in any of: ${candidates.join(', ')}`)
}

export interface Db {
  all<T = Record<string, unknown>>(sql: string, params?: SQLInputValue[]): T[]
  get<T = Record<string, unknown>>(sql: string, params?: SQLInputValue[]): T | undefined
  run(sql: string, params?: SQLInputValue[]): StatementResultingChanges
  exec(sql: string): void
  /** Run `fn` inside a transaction; rolls back on throw. */
  transaction<T>(fn: () => T): T
  close(): void
}

export function createDatabase(path: string): Db {
  if (path !== ':memory:') {
    mkdirSync(dirname(path), { recursive: true })
  }
  const sqlite = new DatabaseSync(path)
  sqlite.exec('PRAGMA journal_mode = WAL')
  sqlite.exec('PRAGMA foreign_keys = ON')

  const wrap: Db = {
    all<T>(sql: string, params: SQLInputValue[] = []): T[] {
      return sqlite.prepare(sql).all(...params) as T[]
    },
    get<T>(sql: string, params: SQLInputValue[] = []): T | undefined {
      return sqlite.prepare(sql).get(...params) as T | undefined
    },
    run(sql: string, params: SQLInputValue[] = []) {
      return sqlite.prepare(sql).run(...params)
    },
    exec(sql: string): void {
      sqlite.exec(sql)
    },
    transaction<T>(fn: () => T): T {
      sqlite.exec('BEGIN IMMEDIATE')
      try {
        const out = fn()
        sqlite.exec('COMMIT')
        return out
      } catch (e) {
        try {
          sqlite.exec('ROLLBACK')
        } catch {
          /* already rolled back */
        }
        throw e
      }
    },
    close(): void {
      sqlite.close()
    }
  }

  migrate(wrap)
  return wrap
}

function migrate(db: Db): void {
  const migrationsDir = findMigrationsDir()
  db.exec(
    'CREATE TABLE IF NOT EXISTS schema_migrations (tag TEXT PRIMARY KEY, applied_at TEXT NOT NULL)'
  )
  const applied = new Set(
    db.all<{ tag: string }>('SELECT tag FROM schema_migrations').map((r) => r.tag)
  )
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
  for (const file of files) {
    if (applied.has(file)) continue
    const sql = readFileSync(join(migrationsDir, file), 'utf8')
    const statements = sql
      .split('--> statement-breakpoint')
      .map((s) => s.trim())
      .filter(Boolean)
    db.transaction(() => {
      for (const stmt of statements) {
        db.exec(stmt)
      }
      db.run('INSERT INTO schema_migrations (tag, applied_at) VALUES (?, ?)', [
        file,
        nowIso()
      ])
    })
  }
}
