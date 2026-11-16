/**
 * Application services in the main process: database bootstrap + the IPC
 * surface. Every handler validates its input with Zod and returns the
 * uniform IpcResult envelope; AppError codes pass through unchanged
 * (guide §15.1, §24.2).
 */

import { app, dialog, ipcMain } from 'electron'
import { join } from 'path'
import { createDatabase, type Db } from '@cross-agent-sync/database'
import * as core from '@cross-agent-sync/core'
import {
  AgentActionSchema,
  appError,
  ContextGetSchema,
  ContextSaveSchema,
  ConversationMessagesSchema,
  ConversationSearchSchema,
  McpPlanSchema,
  ProjectCreateSchema,
  ProjectIdSchema,
  RulesApplySchema,
  TaskCreateSchema,
  TaskUpdateSchema,
  type IpcResult
} from '@cross-agent-sync/shared'
import { agentsStatus, applyMcp, applyRules, cleanupMcpConfigs, planMcp, planRules } from './agents'
import * as conversationsMod from './conversations'
import * as filesMod from './files'

let handle: Db | null = null

export function db(): Db {
  if (!handle) throw appError('DATABASE_ERROR', 'database not initialised')
  return handle
}

export function initServices(): void {
  const path = join(app.getPath('userData'), 'cross-agent-sync.db')
  handle = createDatabase(path)
}

export function closeServices(): void {
  handle?.close()
  handle = null
}

/** Swap in a new database handle (used by backup restore). */
export function setHandle(next: Db): void {
  handle = next
}

function ok<T>(data: T): IpcResult<T> {
  return { ok: true, data }
}

function err(e: unknown): IpcResult<never> {
  if (e && typeof e === 'object' && 'code' in e && 'message' in e) {
    const ae = e as { code: string; message: string }
    return { ok: false, error: { code: ae.code, message: ae.message } }
  }
  return { ok: false, error: { code: 'INTERNAL', message: String(e) } }
}

/** Wrap a handler: Zod-validate the input, envelope the result. */
function on<S>(
  channel: string,
  schema: { parse: (x: unknown) => S },
  fn: (input: S) => unknown | Promise<unknown>
): void {
  ipcMain.handle(channel, async (_event, raw): Promise<IpcResult<unknown>> => {
    try {
      const input = schema.parse(raw)
      return ok((await fn(input)) as never)
    } catch (e) {
      if (e instanceof Error && e.name === 'ZodError') {
        return err(appError('INVALID_INPUT', e.message))
      }
      return err(e)
    }
  })
}

const Passthrough = { parse: (x: unknown) => (x ?? {}) as Record<string, never> }

export function registerIpc(): void {
  on('projects:list', Passthrough, () => core.listProjects(db()))
  on('projects:create', ProjectCreateSchema, (input) => core.createProject(db(), input))
  on('projects:remove', ProjectIdSchema, (input) => {
    core.removeProject(db(), input.projectId)
    cleanupMcpConfigs(input.projectId)
    return { removed: input.projectId }
  })

  on('dialog:pickDirectory', Passthrough, async () => {
    const r = await dialog.showOpenDialog({ properties: ['openDirectory'] })
    return r.canceled ? null : r.filePaths[0]
  })

  on('context:get', ContextGetSchema, (input) =>
    core.readContext(db(), input.projectId, input.type)
  )
  on('context:save', ContextSaveSchema, (input) => core.saveContext(db(), input))
  on('context:external', ContextGetSchema, (input) =>
    core.hasExternalChange(db(), input.projectId, input.type)
  )
  on('context:resync', ContextGetSchema, (input) =>
    core.resyncContext(db(), input.projectId, input.type)
  )

  on('tasks:list', ProjectIdSchema, (input) => core.listTasks(db(), input.projectId))
  on('tasks:create', TaskCreateSchema, (input) => core.createTask(db(), input))
  on('tasks:update', TaskUpdateSchema, (input) => core.updateTask(db(), input))

  on('agents:status', ProjectIdSchema, (input) => agentsStatus(input.projectId))
  on('agents:planRules', ProjectIdSchema, (input) => planRules(input.projectId))
  on('agents:applyRules', RulesApplySchema, (input) =>
    applyRules(input.projectId, input.expectedHash)
  )
  on('agents:planMcp', McpPlanSchema, (input) => planMcp(input.projectId, input.agentId))
  on('agents:applyMcp', AgentActionSchema, (input) =>
    applyMcp(input.projectId, input.agentId, input.expectedHash)
  )

  on('conv:import', ProjectIdSchema, (input) =>
    conversationsMod.importForProject(db(), input.projectId)
  )
  on('conv:list', ProjectIdSchema, (input) =>
    conversationsMod.listForProject(db(), input.projectId)
  )
  on('conv:messages', ConversationMessagesSchema, (input) =>
    conversationsMod.messagesOf(db(), input.conversationId)
  )
  on('conv:search', ConversationSearchSchema, (input) => conversationsMod.search(db(), input))
  on('files:events', ProjectIdSchema, (input) => filesMod.fileEvents(db(), input.projectId))
  on('files:git', Passthrough, async (input: { rootPath?: string }) => {
    if (!input?.rootPath) throw appError('INVALID_INPUT', 'rootPath required')
    return filesMod.gitStatus(String(input.rootPath))
  })
}
