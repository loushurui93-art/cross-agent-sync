/**
 * Context Manager (guide §7.2, §8, §16.4). The Markdown file inside
 * `.agent-sync/` is the single source of truth; SQLite keeps the index
 * (path, version, content hash). Saves are atomic (tmp + rename) and
 * detect external edits: a save over an externally-changed file is a
 * conflict, never a silent overwrite.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { SELECTS, type ContextIndexRow, type Db } from '@cross-agent-sync/database'
import { appError, nowIso, type ContextType } from '@cross-agent-sync/shared'
import { hashText } from './hash'
import { logAudit } from './audit'
import { projectRoot } from './projects'
import { APP_DIR_NAME } from './templates'

export interface ContextDoc {
  projectId: string
  type: ContextType
  title: string
  relativePath: string
  version: number
  content: string
  updatedAt: string
}

export interface SaveContextInput {
  projectId: string
  type: ContextType
  content: string
  /** When given, must match the index version the caller last saw. */
  expectedVersion?: number
  /**
   * Explicit user override of the external-change guard (the UI offers this
   * as "keep my edits" after showing the conflict). Still audited.
   */
  force?: boolean
}

function contextRow(db: Db, projectId: string, type: string): ContextIndexRow {
  const row = db.get<ContextIndexRow>(
    `${SELECTS.context} WHERE project_id = ? AND context_type = ?`,
    [projectId, type]
  )
  if (!row) throw appError('CONTEXT_NOT_FOUND', `no ${type} doc for project ${projectId}`)
  return row
}

function contextPath(root: string, row: ContextIndexRow): string {
  return join(root, APP_DIR_NAME, row.relativePath)
}

export function readContext(db: Db, projectId: string, type: ContextType): ContextDoc {
  const root = projectRoot(db, projectId)
  const row = contextRow(db, projectId, type)
  const abs = contextPath(root, row)
  const content = existsSync(abs) ? readFileSync(abs, 'utf8') : ''
  return {
    projectId,
    type,
    title: row.title,
    relativePath: row.relativePath,
    version: row.version,
    content,
    updatedAt: row.updatedAt
  }
}

/** True when the file on disk no longer matches the indexed hash. */
export function hasExternalChange(db: Db, projectId: string, type: ContextType): boolean {
  const root = projectRoot(db, projectId)
  const row = contextRow(db, projectId, type)
  const abs = contextPath(root, row)
  if (!existsSync(abs)) return true
  return hashText(readFileSync(abs, 'utf8')) !== row.contentHash
}

export function saveContext(db: Db, input: SaveContextInput): ContextDoc {
  const root = projectRoot(db, input.projectId)
  const row = contextRow(db, input.projectId, input.type)

  if (input.expectedVersion !== undefined && input.expectedVersion !== row.version) {
    throw appError(
      'VERSION_CONFLICT',
      `context ${input.type} is at v${row.version}, caller expected v${input.expectedVersion}`
    )
  }

  const abs = contextPath(root, row)
  if (!input.force && existsSync(abs)) {
    const diskHash = hashText(readFileSync(abs, 'utf8'))
    if (diskHash !== row.contentHash) {
      // The file changed outside the app since we indexed it — refuse to
      // clobber it (guide §16.4).
      throw appError(
        'VERSION_CONFLICT',
        `${row.relativePath} was modified outside Cross-Agent Sync; reload it before saving`
      )
    }
  }

  const now = nowIso()
  const newVersion = row.version + 1
  atomicWrite(abs, input.content)

  db.run(
    'UPDATE contexts SET version = ?, content_hash = ?, updated_at = ? WHERE id = ?',
    [newVersion, hashText(input.content), now, row.id]
  )

  logAudit(db, {
    projectId: input.projectId,
    actorType: 'user',
    action: 'context.saved',
    targetType: 'context',
    targetId: `${input.projectId}/${input.type}`,
    details: { version: newVersion, force: input.force === true }
  })

  return {
    projectId: input.projectId,
    type: input.type,
    title: row.title,
    relativePath: row.relativePath,
    version: newVersion,
    content: input.content,
    updatedAt: now
  }
}

/** Adopt an externally edited file into the index (explicit re-sync). */
export function resyncContext(db: Db, projectId: string, type: ContextType): ContextDoc {
  const root = projectRoot(db, projectId)
  const row = contextRow(db, projectId, type)
  const abs = contextPath(root, row)
  const content = existsSync(abs) ? readFileSync(abs, 'utf8') : ''
  db.run(
    'UPDATE contexts SET content_hash = ?, version = ?, updated_at = ? WHERE id = ?',
    [hashText(content), row.version + 1, nowIso(), row.id]
  )
  logAudit(db, {
    projectId,
    actorType: 'user',
    action: 'context.resynced',
    targetType: 'context',
    targetId: `${projectId}/${type}`
  })
  return readContext(db, projectId, type)
}

export function atomicWrite(abs: string, content: string): void {
  const tmp = `${abs}.tmp-${process.pid}-${Date.now()}`
  const dir = dirname(abs)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  writeFileSync(tmp, content, 'utf8')
  renameSync(tmp, abs)
}
