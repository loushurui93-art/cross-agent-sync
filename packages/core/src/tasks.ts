/**
 * Task Manager (guide §7.2, §10.4). Optimistic concurrency: callers may pass
 * `expectedVersion`; a stale version conflicts instead of overwriting.
 */

import { randomUUID } from 'node:crypto'
import { SELECTS, type Db, type TaskRow } from '@cross-agent-sync/database'
import {
  appError,
  nowIso,
  TASK_STATUSES,
  type TaskStatus
} from '@cross-agent-sync/shared'
import { logAudit } from './audit'

export type { TaskRow }

export interface CreateTaskInput {
  projectId: string
  title: string
  description?: string
  priority?: number
  actor?: { type: 'user' | 'agent' | 'system'; id?: string }
}

export interface UpdateTaskInput {
  projectId: string
  taskId: string
  title?: string
  description?: string
  status?: TaskStatus
  priority?: number
  expectedVersion?: number
  actor?: { type: 'user' | 'agent' | 'system'; id?: string }
}

function requireProject(db: Db, projectId: string): void {
  const row = db.get('SELECT 1 FROM projects WHERE id = ?', [projectId])
  if (!row) throw appError('PROJECT_NOT_FOUND', `no project ${projectId}`)
}

export function createTask(db: Db, input: CreateTaskInput): TaskRow {
  requireProject(db, input.projectId)
  const title = input.title.trim()
  if (!title) throw appError('INVALID_INPUT', 'task title is required')
  const now = nowIso()
  const id = randomUUID()
  db.run(
    'INSERT INTO tasks (id, project_id, title, description, status, priority, version, created_at, updated_at) ' +
      'VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)',
    [
      id,
      input.projectId,
      title,
      input.description?.trim() || null,
      'todo',
      input.priority ?? 2,
      now,
      now
    ]
  )
  logAudit(db, {
    projectId: input.projectId,
    actorType: input.actor?.type ?? 'user',
    actorId: input.actor?.id,
    action: 'task.created',
    targetType: 'task',
    targetId: id
  })
  return getTask(db, input.projectId, id)
}

export function getTask(db: Db, projectId: string, taskId: string): TaskRow {
  const row = db.get<TaskRow>(`${SELECTS.task} WHERE project_id = ? AND id = ?`, [
    projectId,
    taskId
  ])
  if (!row) throw appError('PROJECT_NOT_FOUND', `no task ${taskId}`)
  return row
}

export function listTasks(db: Db, projectId: string): TaskRow[] {
  requireProject(db, projectId)
  return db.all<TaskRow>(`${SELECTS.task} WHERE project_id = ? ORDER BY created_at DESC`, [
    projectId
  ])
}

export function updateTask(db: Db, input: UpdateTaskInput): TaskRow {
  const current = getTask(db, input.projectId, input.taskId)
  if (input.expectedVersion !== undefined && input.expectedVersion !== current.version) {
    throw appError(
      'VERSION_CONFLICT',
      `task ${input.taskId} is at v${current.version}, caller expected v${input.expectedVersion}`
    )
  }
  if (input.status && !TASK_STATUSES.includes(input.status)) {
    throw appError('INVALID_INPUT', `invalid status: ${input.status}`)
  }
  db.run(
    'UPDATE tasks SET title = ?, description = ?, status = ?, priority = ?, version = ?, updated_at = ? ' +
      'WHERE project_id = ? AND id = ?',
    [
      input.title?.trim() || current.title,
      input.description?.trim() ?? current.description,
      input.status ?? current.status,
      input.priority ?? current.priority,
      current.version + 1,
      nowIso(),
      input.projectId,
      input.taskId
    ]
  )
  logAudit(db, {
    projectId: input.projectId,
    actorType: input.actor?.type ?? 'user',
    actorId: input.actor?.id,
    action: 'task.updated',
    targetType: 'task',
    targetId: input.taskId,
    details: { status: input.status, fromVersion: current.version }
  })
  return getTask(db, input.projectId, input.taskId)
}
