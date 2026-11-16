/**
 * Cross-module types and constants. The single source of truth for shapes
 * shared between the desktop app, core services, adapters and the MCP
 * server. Zod schemas will live here alongside the types as they are
 * introduced (guide §4.1, §6).
 */

/** Agents supported in V1 (guide scope decision: ZCode + Codex only). */
export const AGENT_KINDS = ['zcode', 'codex'] as const
export type AgentKind = (typeof AGENT_KINDS)[number]

/** Task statuses (guide §7.2 `tasks`). */
export const TASK_STATUSES = [
  'todo',
  'in_progress',
  'blocked',
  'done',
  'cancelled'
] as const
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

export const APP_DIR_NAME = '.agent-sync'
export const MANIFEST_FILE = 'manifest.json'

/**
 * Uniform error envelope for Core services (guide §24.2). Never leak raw
 * stack traces to the UI or to agents over MCP.
 */
export type AppErrorCode =
  | 'PROJECT_NOT_FOUND'
  | 'CONTEXT_NOT_FOUND'
  | 'PERMISSION_DENIED'
  | 'PATH_OUTSIDE_PROJECT'
  | 'VERSION_CONFLICT'
  | 'IMPORT_FAILED'
  | 'INVALID_INPUT'
  | 'DATABASE_ERROR'

export interface AppError {
  code: AppErrorCode
  message: string
  retryable: boolean
}

export function appError(
  code: AppErrorCode,
  message: string,
  retryable = false
): AppError {
  return { code, message, retryable }
}

/** ISO 8601 UTC timestamp, the canonical time format everywhere (guide §7.3). */
export type Iso8601 = string

export function nowIso(): Iso8601 {
  return new Date().toISOString()
}

export * from './schemas'
