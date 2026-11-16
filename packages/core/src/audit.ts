/**
 * Audit trail (guide §3.5, §7.2). Every meaningful write records who/what/
 * when/result. Attribution must never be guessed: unknown agents stay
 * `unknown`.
 */

import { randomUUID } from 'node:crypto'
import type { Db } from '@cross-agent-sync/database'
import { nowIso } from '@cross-agent-sync/shared'

export type ActorType = 'user' | 'agent' | 'system'

export interface AuditEntry {
  projectId?: string
  actorType: ActorType
  actorId?: string
  action: string
  targetType?: string
  targetId?: string
  result?: 'ok' | 'error'
  details?: Record<string, unknown>
}

export function logAudit(db: Db, entry: AuditEntry): void {
  db.run(
    'INSERT INTO audit_logs (id, project_id, actor_type, actor_id, action, target_type, target_id, result, details_json, created_at) ' +
      'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [
      randomUUID(),
      entry.projectId ?? null,
      entry.actorType,
      entry.actorId ?? null,
      entry.action,
      entry.targetType ?? null,
      entry.targetId ?? null,
      entry.result ?? 'ok',
      entry.details ? JSON.stringify(entry.details) : null,
      nowIso()
    ]
  )
}
