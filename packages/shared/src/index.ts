/**
 * Cross-module types and constants. The single source of truth for shapes
 * shared between the desktop app, core services, adapters and the MCP
 * server. Enums + Zod schemas live in ./schemas (re-exported here).
 */

export { AGENT_KINDS, TASK_STATUSES, CONTEXT_TYPES } from './schemas'
export type { AgentKind, TaskStatus, ContextType } from './schemas'

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

/** Typed error thrown across Core/IPC/MCP boundaries (carries its code). */
export class AppError extends Error implements AppError {
  code: AppErrorCode
  retryable: boolean
  constructor(code: AppErrorCode, message: string, retryable = false) {
    super(message)
    this.name = 'AppError'
    this.code = code
    this.retryable = retryable
  }
}

export function appError(code: AppErrorCode, message: string, retryable = false): AppError {
  return new AppError(code, message, retryable)
}

/** ISO 8601 UTC timestamp, the canonical time format everywhere (guide §7.3). */
export type Iso8601 = string

export function nowIso(): Iso8601 {
  return new Date().toISOString()
}

export * from './schemas'
