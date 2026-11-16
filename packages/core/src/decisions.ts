/**
 * Technical decisions (guide §7.2, §8): SQLite row + Markdown file under
 * `.agent-sync/context/decisions/`.
 */

import { randomUUID } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { Db } from '@cross-agent-sync/database'
import { nowIso } from '@cross-agent-sync/shared'
import { logAudit, type ActorType } from './audit'
import { projectRoot } from './projects'
import { APP_DIR_NAME } from './templates'

export interface DecisionRow {
  id: string
  projectId: string
  title: string
  summary: string | null
  relativePath: string | null
  agentId: string | null
  decidedAt: string
  createdAt: string
}

export interface RecordDecisionInput {
  projectId: string
  title: string
  summary?: string
  agentId?: string
  actor?: { type: ActorType; id?: string }
}

const DECISION_SELECT =
  'SELECT id, project_id AS "projectId", title, summary, relative_path AS "relativePath", ' +
  'agent_id AS "agentId", decided_at AS "decidedAt", created_at AS "createdAt" FROM decisions'

function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'decision'
  )
}

export function recordDecision(db: Db, input: RecordDecisionInput): DecisionRow {
  const root = projectRoot(db, input.projectId)
  const title = input.title.trim()
  if (!title) throw new Error('decision title is required')
  const id = randomUUID()
  const now = nowIso()
  const rel = join(
    APP_DIR_NAME,
    'context',
    'decisions',
    `${now.slice(0, 10)}-${slugify(title)}.md`
  )
  const abs = join(root, rel)
  mkdirSync(dirname(abs), { recursive: true })
  writeFileSync(abs, `# ADR: ${title}\n\n- Date: ${now}\n- Agent: ${input.agentId ?? 'unknown'}\n\n## Context\n\n## Decision\n\n${input.summary?.trim() ?? ''}\n\n## Consequences\n`, 'utf8')

  db.run(
    'INSERT INTO decisions (id, project_id, title, summary, relative_path, agent_id, decided_at, created_at) ' +
      'VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [id, input.projectId, title, input.summary?.trim() ?? null, rel, input.agentId ?? null, now, now]
  )
  logAudit(db, {
    projectId: input.projectId,
    actorType: input.actor?.type ?? 'agent',
    actorId: input.actor?.id ?? input.agentId,
    action: 'decision.recorded',
    targetType: 'decision',
    targetId: id
  })
  return db.get<DecisionRow>(`${DECISION_SELECT} WHERE id = ?`, [id]) as DecisionRow
}

export function listDecisions(db: Db, projectId: string): DecisionRow[] {
  projectRoot(db, projectId)
  return db.all<DecisionRow>(`${DECISION_SELECT} WHERE project_id = ? ORDER BY decided_at DESC`, [
    projectId
  ])
}
