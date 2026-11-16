import { afterAll, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { createDatabase, type DatabaseHandle } from '../src/client'
import { projects } from '../src/schema'

const handle: DatabaseHandle = createDatabase(':memory:')
const { db, close } = handle
afterAll(() => close())

function makeDb(): DatabaseHandle {
  return createDatabase(':memory:')
}

describe('database', () => {
  it('migrates and enforces foreign keys', () => {
    expect(handle.sqlite.pragma('foreign_keys', { simple: true })).toBe(1)
  })

  it('inserts and reads a project', () => {
    const now = new Date().toISOString()
    db.insert(projects)
      .values({
        id: 'proj-test-1',
        name: 'demo',
        rootPath: 'C:/tmp/demo',
        createdAt: now,
        updatedAt: now
      })
      .run()
    const row = db.select().from(projects).where(eq(projects.id, 'proj-test-1')).get()
    expect(row?.name).toBe('demo')
    expect(row?.rootPath).toBe('C:/tmp/demo')
  })

  it('rejects rows missing required columns', () => {
    const t = makeDb()
    expect(() =>
      // @ts-expect-error exercising runtime constraint
      t.db.insert(projects).values({ id: 'x' }).run()
    ).toThrow()
    t.close()
  })
})
