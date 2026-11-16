/**
 * Renderer-side API client: unwraps the IpcResult envelope into plain
 * values or thrown ApiFailures carrying the error code.
 */

import type { IpcResult } from '@cross-agent-sync/shared'
import type { ContextDoc, ProjectRow, TaskRow } from '@cross-agent-sync/core'

export class ApiError extends Error {
  code: string
  constructor(code: string, message: string) {
    super(message)
    this.code = code
  }
}

async function call<T>(p: Promise<IpcResult<T>>): Promise<T> {
  const r = await p
  if (!r.ok) throw new ApiError(r.error.code, r.error.message)
  return r.data
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const A = (window as any).api

export const api = {
  projects: {
    list: () => call<ProjectRow[]>(A.projects.list()),
    create: (input: { name: string; rootPath: string; description?: string }) =>
      call<ProjectRow>(A.projects.create(input)),
    remove: (projectId: string) => call<{ removed: string }>(A.projects.remove(projectId))
  },
  context: {
    get: (projectId: string, type: string) => call<ContextDoc>(A.context.get(projectId, type)),
    save: (input: { projectId: string; type: string; content: string; expectedVersion?: number }) =>
      call<ContextDoc>(A.context.save(input)),
    external: (projectId: string, type: string) =>
      call<boolean>(A.context.external(projectId, type)),
    resync: (projectId: string, type: string) => call<ContextDoc>(A.context.resync(projectId, type))
  },
  tasks: {
    list: (projectId: string) => call<TaskRow[]>(A.tasks.list(projectId)),
    create: (input: { projectId: string; title: string; description?: string }) =>
      call<TaskRow>(A.tasks.create(input)),
    update: (input: {
      projectId: string
      taskId: string
      status?: string
      expectedVersion?: number
    }) => call<TaskRow>(A.tasks.update(input))
  },
  dialog: {
    pickDirectory: () => call<string | null>(A.dialog.pickDirectory())
  }
}
