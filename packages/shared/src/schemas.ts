/**
 * Zod schemas validating every IPC / MCP boundary input (guide §15.1).
 * Keep them in sync with the Core service signatures.
 */

import { z } from 'zod'

// Constants live here (not in index.ts) so this module has no circular
// dependency on the package root — bundlers evaluate dependencies first
// and a cycle here dead-zones these consts ("Cannot access before
// initialization").

/** Agents supported in V1: ZCode + Codex; claude-code since v0.2. */
export const AGENT_KINDS = ['zcode', 'codex', 'claude-code'] as const
export type AgentKind = (typeof AGENT_KINDS)[number]

/** Task statuses (guide §7.2 `tasks`). */
export const TASK_STATUSES = ['todo', 'in_progress', 'blocked', 'done', 'cancelled'] as const
export type TaskStatus = (typeof TASK_STATUSES)[number]

/** Context document types (guide §8 `.agent-sync/context/`). */
export const CONTEXT_TYPES = [
  'overview',
  'architecture',
  'development-state',
  'rules',
  'decision',
  'handoff'
] as const
export type ContextType = (typeof CONTEXT_TYPES)[number]

export const ProjectCreateSchema = z.object({
  name: z.string().trim().min(1).max(200),
  rootPath: z.string().trim().min(1),
  description: z.string().trim().max(2000).optional(),
  template: z.enum(['default', 'frontend', 'backend', 'research']).optional()
})
export type ProjectCreateInput = z.infer<typeof ProjectCreateSchema>

export const ProjectIdSchema = z.object({ projectId: z.string().min(1) })

export const ContextTypeSchema = z.enum(CONTEXT_TYPES)

export const ContextGetSchema = ProjectIdSchema.extend({
  type: ContextTypeSchema
})

export const ContextSaveSchema = ContextGetSchema.extend({
  content: z.string().max(2_000_000),
  expectedVersion: z.number().int().positive().optional(),
  force: z.boolean().optional()
})

export const TaskCreateSchema = ProjectIdSchema.extend({
  title: z.string().trim().min(1).max(500),
  description: z.string().trim().max(10_000).optional(),
  priority: z.number().int().min(0).max(5).optional()
})

export const TaskUpdateSchema = ProjectIdSchema.extend({
  taskId: z.string().min(1),
  title: z.string().trim().min(1).max(500).optional(),
  description: z.string().max(10_000).optional(),
  status: z.enum(TASK_STATUSES).optional(),
  priority: z.number().int().min(0).max(5).optional(),
  expectedVersion: z.number().int().positive().optional()
})

export const AgentKindSchema = z.enum(AGENT_KINDS)

export const ConversationSearchSchema = z.object({
  query: z.string().trim().min(1).max(200),
  projectId: z.string().min(1).optional(),
  agentId: AgentKindSchema.optional(),
  sinceDays: z.number().int().min(1).max(365).optional(),
  limit: z.number().int().min(1).max(200).optional()
})

export const ConversationMessagesSchema = z.object({
  conversationId: z.string().min(1)
})

/** Apply the AGENTS.md plan previewed earlier (hash must still match). */
export const RulesApplySchema = ProjectIdSchema.extend({
  expectedHash: z.string().min(8)
})

export const McpPlanSchema = ProjectIdSchema.extend({ agentId: AgentKindSchema })

export const AgentActionSchema = McpPlanSchema.extend({
  /** Hash of the previewed plan.next — apply aborts if it changed since. */
  expectedHash: z.string().min(8)
})

/** Uniform IPC envelope: successes carry data, failures carry a code. */
export interface IpcOk<T> {
  ok: true
  data: T
}
export interface IpcErr {
  ok: false
  error: { code: string; message: string }
}
export type IpcResult<T> = IpcOk<T> | IpcErr
