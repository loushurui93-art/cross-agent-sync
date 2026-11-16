import { beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createDatabase, type Db } from '@cross-agent-sync/database'
import {
  createProject,
  removeProject,
  listProjects,
  saveContext,
  readContext,
  hasExternalChange,
  resyncContext,
  createTask,
  updateTask,
  listTasks,
  resolveWithin,
  APP_DIR_NAME
} from '../src'

let db: Db
let root: string

beforeEach(() => {
  db?.close()
  db = createDatabase(':memory:')
  root = mkdtempSync(join(tmpdir(), 'cas-core-'))
})

describe('projects', () => {
  it('scaffolds .agent-sync and indexes the four context docs', () => {
    const id = createProject(db, { name: 'demo', rootPath: root }).id
    const manifest = JSON.parse(
      readFileSync(join(root, APP_DIR_NAME, 'manifest.json'), 'utf8')
    )
    expect(manifest.schemaVersion).toBe(1)
    expect(manifest.projectId).toBe(id)
    for (const f of [
      'context/overview.md',
      'context/architecture.md',
      'context/development-state.md',
      'context/rules.md',
      'tasks/tasks.json'
    ]) {
      expect(existsSync(join(root, APP_DIR_NAME, f)), f).toBe(true)
    }
  })

  it('re-importing adopts existing files instead of overwriting', () => {
    createProject(db, { name: 'first', rootPath: root })
    const doc = join(root, APP_DIR_NAME, 'context/overview.md')
    writeFileSync(doc, '# my own overview\n')
    const p2 = createProject(db, { name: 'second', rootPath: root }).id
    expect(readFileSync(doc, 'utf8')).toBe('# my own overview\n')
    // and the index adopted the on-disk body
    expect(readContext(db, p2, 'overview').content).toBe('# my own overview\n')
  })

  it('removing a project un-manages it but keeps files on disk', () => {
    const id = createProject(db, { name: 'demo', rootPath: root }).id
    removeProject(db, id)
    expect(listProjects(db)).toHaveLength(0)
    expect(existsSync(join(root, APP_DIR_NAME, 'manifest.json'))).toBe(true)
  })

  it('rejects a root path that is not a directory', () => {
    expect(() =>
      createProject(db, { name: 'x', rootPath: join(root, 'nope') })
    ).toThrow(/not a directory/)
  })
})

describe('context', () => {
  it('round-trips a save with version bump', () => {
    const id = createProject(db, { name: 'demo', rootPath: root }).id
    const saved = saveContext(db, { projectId: id, type: 'overview', content: '# updated' })
    expect(saved.version).toBe(2)
    expect(readContext(db, id, 'overview').content).toBe('# updated')
  })

  it('detects external edits and refuses to clobber them', () => {
    const id = createProject(db, { name: 'demo', rootPath: root }).id
    const doc = join(root, APP_DIR_NAME, 'context/overview.md')
    writeFileSync(doc, '# externally edited\n')
    expect(hasExternalChange(db, id, 'overview')).toBe(true)
    expect(() =>
      saveContext(db, { projectId: id, type: 'overview', content: '# mine' })
    ).toThrow(/modified outside/)
    // explicit resync adopts the external body
    const after = resyncContext(db, id, 'overview')
    expect(after.content).toBe('# externally edited\n')
    expect(hasExternalChange(db, id, 'overview')).toBe(false)
  })

  it('honours expectedVersion for optimistic locking', () => {
    const id = createProject(db, { name: 'demo', rootPath: root }).id
    expect(() =>
      saveContext(db, {
        projectId: id,
        type: 'overview',
        content: 'x',
        expectedVersion: 99
      })
    ).toThrow(/expected/)
  })
})

describe('tasks', () => {
  it('creates, updates and enforces optimistic locking', () => {
    const id = createProject(db, { name: 'demo', rootPath: root }).id
    const t = createTask(db, { projectId: id, title: 'do it' })
    expect(t.status).toBe('todo')
    expect(t.version).toBe(1)

    const next = updateTask(db, {
      projectId: id,
      taskId: t.id,
      status: 'in_progress',
      expectedVersion: 1
    })
    expect(next.version).toBe(2)

    expect(() =>
      updateTask(db, {
        projectId: id,
        taskId: t.id,
        status: 'done',
        expectedVersion: 1 // stale
      })
    ).toThrow(/expected/)

    expect(listTasks(db, id)).toHaveLength(1)
  })

  it('rejects an invalid status', () => {
    const id = createProject(db, { name: 'demo', rootPath: root }).id
    const t = createTask(db, { projectId: id, title: 't' })
    expect(() =>
      updateTask(db, {
        projectId: id,
        taskId: t.id,
        // @ts-expect-error runtime check exercise
        status: 'banana'
      })
    ).toThrow(/invalid status/)
  })
})

describe('path safety', () => {
  it('rejects traversal outside the project root', () => {
    expect(() => resolveWithin(root, '../escape.txt')).toThrow(/escapes/)
    expect(() => resolveWithin(root, 'a/../../escape')).toThrow(/escapes/)
    expect(resolveWithin(root, 'nested/file.md')).toBe(join(root, 'nested', 'file.md'))
  })
})
