/**
 * Handoff records (guide §7.2, §24.4): SQLite row for queries + a Markdown
 * file under `.agent-sync/handoffs/` for humans and Git.
 */

import { randomUUID } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { Db } from '@cross-agent-sync/database'
import { nowIso } from '@cross-agent-sync/shared'
import { logAudit, type ActorType } from './audit'
import { projectRoot } from './projects'
import { APP_DIR_NAME } from './templates'

export interface HandoffRow {
  id: string
  projectId: string
  fromAgentId: string | null
  toAgentId: string | null
  summary: string
  completedTasksJson: string | null
  nextStepsJson: string | null
  createdAt: string
}

export interface CreateHandoffInput {
  projectId: string
  summary: string
  fromAgent?: string
  toAgent?: string
  completedTasks?: string[]
  nextSteps?: string[]
  actor?: { type: ActorType; id?: string }
}

const HANDOFF_SELECT =
  'SELECT id, project_id AS "projectId", from_agent_id AS "fromAgentId", ' +
  'to_agent_id AS "toAgentId", summary, completed_tasks_json AS "completedTasksJson", ' +
  'next_steps_json AS "nextStepsJson", created_at AS "createdAt" FROM handoffs'

export function createHandoff(db: Db, input: CreateHandoffInput): HandoffRow {
  const root = projectRoot(db, input.projectId)
  const summary = input.summary.trim()
  if (!summary) throw new Error('handoff summary is required')
  const id = randomUUID()
  const now = nowIso()
  const completed = input.completedTasks ?? []
  const next = input.nextSteps ?? []

  // Human-readable Markdown copy (guide §24.4 template)
  const slug = now.replace(/[:.]/g, '-').replace('T', ' ')
  const rel = join(APP_DIR_NAME, 'handoffs', `${now.slice(0, 10)}-${id.slice(0, 8)}.md`)
  const abs = join(root, rel)
  mkdirSync(dirname(abs), { recursive: true })
  writeFileSync(
    abs,
    [
      '# Agent Handoff',
      '',
      '## Metadata',
      '',
      `- Project: ${db.get<{ name: string }>('SELECT name FROM projects WHERE id = ?', [input.projectId])?.name ?? input.projectId}`,
      `- From Agent: ${input.fromAgent ?? 'unknown'}`,
      `- To Agent: ${input.toAgent ?? 'unknown'}`,
      `- Created At: ${now}`,
      '',
      '## Summary',
      '',
      summary,
      '',
      '## Completed Work',
      '',
      ...completed.map((t) => `- ${t}`),
      '',
      '## Next Steps',
      '',
      ...next.map((t) => `- ${t}`),
      ''
    ].join('\n'),
    'utf8'
  )
  void slug

  db.run(
    'INSERT INTO handoffs (id, project_id, from_agent_id, to_agent_id, summary, completed_tasks_json, next_steps_json, created_at) ' +
      'VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [
      id,
      input.projectId,
      input.fromAgent ?? null,
      input.toAgent ?? null,
      summary,
      JSON.stringify(completed),
      JSON.stringify(next),
      now
    ]
  )
  logAudit(db, {
    projectId: input.projectId,
    actorType: input.actor?.type ?? 'agent',
    actorId: input.actor?.id ?? input.fromAgent,
    action: 'handoff.created',
    targetType: 'handoff',
    targetId: id
  })
  return getHandoff(db, id) as HandoffRow
}

export function getHandoff(db: Db, id: string): HandoffRow {
  const row = db.get<HandoffRow>(`${HANDOFF_SELECT} WHERE id = ?`, [id])
  if (!row) throw new Error(`no handoff ${id}`)
  return row
}

export function getLatestHandoff(db: Db, projectId: string): HandoffRow | null {
  projectRoot(db, projectId)
  return (
    db.get<HandoffRow>(`${HANDOFF_SELECT} WHERE project_id = ? ORDER BY created_at DESC LIMIT 1`, [
      projectId
    ]) ?? null
  )
}
