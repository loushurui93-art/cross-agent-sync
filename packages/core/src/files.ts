/**
 * File change reporting (guide §7.2, §12.2). Watcher events carry no agent
 * attribution (agent_id NULL); agents may claim changes via MCP, but a
 * claim is recorded as a claim, not proof. All paths are confined to the
 * project root.
 */

import { randomUUID } from 'node:crypto'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import type { Db } from '@cross-agent-sync/database'
import { nowIso } from '@cross-agent-sync/shared'
import { logAudit, type ActorType } from './audit'
import { projectRoot } from './projects'
import { resolveWithin } from './paths'

export interface FileEventRow {
  id: string
  projectId: string
  relativePath: string
  eventType: string
  agentId: string | null
  contentHash: string | null
  note: string | null
  timestamp: string
}

const EVENT_TYPES = ['add', 'change', 'unlink', 'rename'] as const
export type FileEventType = (typeof EVENT_TYPES)[number]

export interface ReportFileChangeInput {
  projectId: string
  relativePath: string
  eventType: FileEventType
  agentId?: string
  note?: string
  actor?: { type: ActorType; id?: string }
}

const FILE_EVENT_SELECT =
  'SELECT id, project_id AS "projectId", relative_path AS "relativePath", event_type AS "eventType", ' +
  'agent_id AS "agentId", content_hash AS "contentHash", note, timestamp FROM file_events'

export function reportFileChange(db: Db, input: ReportFileChangeInput): FileEventRow {
  const root = projectRoot(db, input.projectId)
  const rel = input.relativePath.replace(/\\/g, '/').replace(/^\.\//, '')
  // Reject traversal before touching the filesystem (guide §15.2)
  const abs = resolveWithin(root, rel)
  void abs

  const id = randomUUID()
  const now = nowIso()
  let hash: string | null = null
  if (input.eventType !== 'unlink' && existsSync(abs)) {
    hash = createHash('sha256').update(readFileSync(abs)).digest('hex')
  }

  db.run(
    'INSERT INTO file_events (id, project_id, relative_path, event_type, agent_id, content_hash, note, timestamp) ' +
      'VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [id, input.projectId, rel, input.eventType, input.agentId ?? null, hash, input.note ?? null, now]
  )
  logAudit(db, {
    projectId: input.projectId,
    actorType: input.actor?.type ?? 'agent',
    actorId: input.actor?.id ?? input.agentId,
    action: 'file.reported',
    targetType: 'file',
    targetId: rel,
    details: { eventType: input.eventType, claimed: Boolean(input.agentId) }
  })
  return db.get<FileEventRow>(`${FILE_EVENT_SELECT} WHERE id = ?`, [id]) as FileEventRow
}

export function listFileEvents(db: Db, projectId: string, limit = 100): FileEventRow[] {
  projectRoot(db, projectId)
  return db.all<FileEventRow>(
    `${FILE_EVENT_SELECT} WHERE project_id = ? ORDER BY timestamp DESC LIMIT ?`,
    [projectId, limit]
  )
}

export { EVENT_TYPES }
