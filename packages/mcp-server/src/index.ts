/**
 * Cross-Agent Sync MCP server (guide §10).
 *
 * Each server instance binds to exactly ONE project (`projectId`) — tools
 * never accept arbitrary project ids or absolute paths. Writes are audited
 * with the agent's identity; imported/untrusted content is never executed.
 * Tool names are stable; new parameters stay backward compatible.
 */

import { z } from 'zod'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { Db } from '@cross-agent-sync/database'
import * as core from '@cross-agent-sync/core'
import { CONTEXT_TYPES, appError } from '@cross-agent-sync/shared'

export interface ServerOptions {
  db: Db
  /** The single project this instance is authorized for. */
  projectId: string
  /** Agent identity used for audit attribution. */
  agentId: string
}

function text(data: unknown): { content: Array<{ type: 'text'; text: string }> } {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] }
}

function fail(e: unknown): { content: Array<{ type: 'text'; text: string }>; isError: true } {
  const message =
    e && typeof e === 'object' && 'code' in e && 'message' in e
      ? `${(e as { code: string }).code}: ${(e as { message: string }).message}`
      : String(e)
  return { content: [{ type: 'text', text: message }], isError: true }
}

/** wrap an async handler: AppError → isError result (never throws to SDK) */
function guard(
  fn: () => unknown
): Promise<{ content: Array<{ type: 'text'; text: string }>; isError?: true }> {
  return Promise.resolve()
    .then(() => text(fn()))
    .catch((e) => fail(e))
}

export function buildServer(opts: ServerOptions): McpServer {
  const { db, projectId, agentId } = opts
  const actor = { type: 'agent' as const, id: agentId }
  // Fail fast: this instance may only serve its bound project.
  core.getProject(db, projectId)

  const server = new McpServer({ name: 'cross-agent-sync', version: '0.1.0' })

  server.tool(
    'list_projects',
    'List the project this Cross-Agent Sync instance is bound to',
    {},
    async () =>
      guard(() => {
        const p = core.getProject(db, projectId)
        return { projects: [{ id: p.id, name: p.name, rootPath: p.rootPath }] }
      })
  )

  server.tool(
    'get_project_context',
    'Read shared project context documents (Markdown)',
    {
      sections: z.array(z.enum(CONTEXT_TYPES)).optional()
    },
    async ({ sections }) =>
      guard(() => {
        const wanted = sections?.length
          ? sections
          : (['overview', 'architecture', 'development-state'] as const)
        const out: Record<string, unknown> = {}
        let maxVersion = 0
        let updatedAt = ''
        for (const s of wanted) {
          try {
            const doc = core.readContext(db, projectId, s)
            out[s] = doc.content
            maxVersion = Math.max(maxVersion, doc.version)
            updatedAt = updatedAt < doc.updatedAt ? doc.updatedAt : updatedAt
          } catch {
            out[s] = null
          }
        }
        return { project_id: projectId, sections: out, version: maxVersion, updated_at: updatedAt }
      })
  )

  server.tool(
    'search_context',
    'Keyword search across the project context documents',
    { query: z.string().min(1).max(200) },
    async ({ query }) =>
      guard(() => {
        const q = query.toLowerCase()
        const hits: Array<{ section: string; line: number; text: string }> = []
        for (const s of ['overview', 'architecture', 'development-state', 'rules'] as const) {
          try {
            const doc = core.readContext(db, projectId, s)
            doc.content.split('\n').forEach((line, i) => {
              if (line.toLowerCase().includes(q)) {
                hits.push({ section: s, line: i + 1, text: line.trim().slice(0, 300) })
              }
            })
          } catch {
            /* section missing */
          }
        }
        return { query, hits: hits.slice(0, 50) }
      })
  )

  server.tool(
    'get_current_tasks',
    'List tasks for the project (optionally filtered by status)',
    { status: z.enum(['todo', 'in_progress', 'blocked', 'done', 'cancelled']).optional() },
    async ({ status }) =>
      guard(() => {
        const all = core.listTasks(db, projectId)
        return { tasks: status ? all.filter((t) => t.status === status) : all }
      })
  )

  server.tool(
    'create_task',
    'Create a task',
    {
      title: z.string().min(1).max(500),
      description: z.string().max(10_000).optional(),
      priority: z.number().int().min(0).max(5).optional()
    },
    async (input) =>
      guard(() => {
        const t = core.createTask(db, {
          projectId,
          title: input.title,
          description: input.description,
          priority: input.priority,
          actor
        })
        return { task: t, by: agentId }
      })
  )

  server.tool(
    'update_task',
    'Update a task. Pass expected_version for optimistic locking (a mismatch returns VERSION_CONFLICT).',
    {
      task_id: z.string().min(1),
      status: z.enum(['todo', 'in_progress', 'blocked', 'done', 'cancelled']).optional(),
      title: z.string().min(1).max(500).optional(),
      description: z.string().max(10_000).optional(),
      priority: z.number().int().min(0).max(5).optional(),
      expected_version: z.number().int().positive().optional()
    },
    async (input) =>
      guard(() => {
        const t = core.updateTask(db, {
          projectId,
          taskId: input.task_id,
          title: input.title,
          description: input.description,
          status: input.status,
          priority: input.priority,
          expectedVersion: input.expected_version,
          actor
        })
        return { task: t, by: agentId }
      })
  )

  server.tool(
    'record_decision',
    'Record a technical decision (ADR)',
    {
      title: z.string().min(1).max(300),
      summary: z.string().max(5_000).optional()
    },
    async (input) =>
      guard(() =>
        core.recordDecision(db, {
          projectId,
          title: input.title,
          summary: input.summary,
          agentId: agentId,
          actor
        })
      )
  )

  server.tool(
    'create_handoff',
    'Create a handoff record for the next agent',
    {
      summary: z.string().min(1).max(5_000),
      completed_tasks: z.array(z.string().max(500)).max(100).optional(),
      next_steps: z.array(z.string().max(500)).max(100).optional(),
      to_agent: z.string().max(100).optional()
    },
    async (input) =>
      guard(() =>
        core.createHandoff(db, {
          projectId,
          summary: input.summary,
          completedTasks: input.completed_tasks,
          nextSteps: input.next_steps,
          fromAgent: agentId,
          toAgent: input.to_agent,
          actor
        })
      )
  )

  server.tool(
    'get_latest_handoff',
    'Read the most recent handoff record',
    {},
    async () => guard(() => core.getLatestHandoff(db, projectId) ?? { handoff: null })
  )

  server.tool(
    'report_file_change',
    'Report that this agent changed a project file (relative path only)',
    {
      relative_path: z.string().min(1).max(1_000),
      event_type: z.enum(['add', 'change', 'unlink', 'rename']),
      note: z.string().max(1_000).optional()
    },
    async (input) =>
      guard(() =>
        core.reportFileChange(db, {
          projectId,
          relativePath: input.relative_path,
          eventType: input.event_type,
          agentId: agentId,
          note: input.note,
          actor
        })
      )
  )

  return server
}

export { appError }
