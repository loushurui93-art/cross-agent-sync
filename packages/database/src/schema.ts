/**
 * Row types for the app database (guide §7.2). SELECTs alias snake_case
 * columns to these camelCase names.
 */

export interface ProjectRow {
  id: string
  name: string
  rootPath: string
  description: string | null
  gitRemote: string | null
  createdAt: string
  updatedAt: string
}

export interface AgentRow {
  id: string
  type: string
  displayName: string
  configPath: string | null
  enabled: number
  createdAt: string
  updatedAt: string
}

export interface ProjectAgentRow {
  projectId: string
  agentId: string
  status: string
  lastSeenAt: string | null
  createdAt: string
}

/** Index over `.agent-sync/` Markdown docs; the file is the body's source of truth. */
export interface ContextIndexRow {
  id: string
  projectId: string
  contextType: string
  title: string
  relativePath: string
  version: number
  contentHash: string | null
  updatedAt: string
}

export interface TaskRow {
  id: string
  projectId: string
  title: string
  description: string | null
  status: string
  priority: number
  assignedAgentId: string | null
  version: number
  createdAt: string
  updatedAt: string
}

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

export interface AuditLogRow {
  id: string
  projectId: string | null
  actorType: string
  actorId: string | null
  action: string
  targetType: string | null
  targetId: string | null
  result: string
  detailsJson: string | null
  createdAt: string
}

/** Canonical SELECT lists (alias snake_case → camelCase). */
export const SELECTS = {
  project:
    'SELECT id, name, root_path AS "rootPath", description, git_remote AS "gitRemote", ' +
    'created_at AS "createdAt", updated_at AS "updatedAt" FROM projects',
  context:
    'SELECT id, project_id AS "projectId", context_type AS "contextType", title, ' +
    'relative_path AS "relativePath", version, content_hash AS "contentHash", ' +
    'updated_at AS "updatedAt" FROM contexts',
  task:
    'SELECT id, project_id AS "projectId", title, description, status, priority, ' +
    'assigned_agent_id AS "assignedAgentId", version, created_at AS "createdAt", ' +
    'updated_at AS "updatedAt" FROM tasks'
} as const
