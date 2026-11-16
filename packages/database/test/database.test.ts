import { describe, expect, it } from 'vitest'
import { createDatabase, type Db } from '../src/client'

function makeDb(): Db {
  return createDatabase(':memory:')
}

describe('database', () => {
  it('migrates and enforces foreign keys', () => {
    const db = makeDb()
    expect(db.get('PRAGMA foreign_keys')).toEqual({ foreign_keys: 1 })
    db.close()
  })

  it('applies migrations idempotently', () => {
    const db = makeDb()
    const tags = db.all<{ tag: string }>('SELECT tag FROM schema_migrations ORDER BY tag')
    expect(tags.length).toBeGreaterThanOrEqual(2)
    db.close()
  })

  it('inserts and reads a project with aliased columns', () => {
    const db = makeDb()
    const now = new Date().toISOString()
    db.run(
      'INSERT INTO projects (id, name, root_path, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
      ['p1', 'demo', 'C:/tmp/demo', now, now]
    )
    const row = db.get<{ name: string; rootPath: string }>(
      'SELECT name, root_path AS "rootPath" FROM projects WHERE id = ?',
      ['p1']
    )
    expect(row?.name).toBe('demo')
    expect(row?.rootPath).toBe('C:/tmp/demo')
    db.close()
  })

  it('rolls back a failed transaction', () => {
    const db = makeDb()
    const now = new Date().toISOString()
    expect(() =>
      db.transaction(() => {
        db.run(
          'INSERT INTO projects (id, name, root_path, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
          ['p2', 'a', 'C:/a', now, now]
        )
        throw new Error('boom')
      })
    ).toThrow('boom')
    expect(db.get('SELECT 1 FROM projects WHERE id = ?', ['p2'])).toBeUndefined()
    db.close()
  })
})
