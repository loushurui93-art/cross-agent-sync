/**
 * Zod schemas validating every IPC / MCP boundary input (guide §15.1).
 * Keep them in sync with the Core service signatures.
 */

import { z } from 'zod'
import { AGENT_KINDS, CONTEXT_TYPES, TASK_STATUSES } from './index'

export const ProjectCreateSchema = z.object({
  name: z.string().trim().min(1).max(200),
  rootPath: z.string().trim().min(1),
  description: z.string().trim().max(2000).optional()
})
export type ProjectCreateInput = z.infer<typeof ProjectCreateSchema>

export const ProjectIdSchema = z.object({ projectId: z.string().min(1) })

export const ContextTypeSchema = z.enum(CONTEXT_TYPES)

export const ContextGetSchema = ProjectIdSchema.extend({
  type: ContextTypeSchema
})

export const ContextSaveSchema = ContextGetSchema.extend({
  content: z.string().max(2_000_000),
  expectedVersion: z.number().int().positive().optional()
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
