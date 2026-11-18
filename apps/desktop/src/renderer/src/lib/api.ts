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
    create: (input: {
      name: string
      rootPath: string
      description?: string
      template?: 'default' | 'frontend' | 'backend' | 'research'
    }) => call<ProjectRow>(A.projects.create(input)),
    remove: (projectId: string) => call<{ removed: string }>(A.projects.remove(projectId))
  },
  context: {
    get: (projectId: string, type: string) => call<ContextDoc>(A.context.get(projectId, type)),
    save: (input: {
      projectId: string
      type: string
      content: string
      expectedVersion?: number
      force?: boolean
    }) => call<ContextDoc>(A.context.save(input)),
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
  },
  agents: {
    status: (projectId: string) => call<AgentsStatus>(A.agents.status(projectId)),
    planRules: (projectId: string) => call<WritePlan>(A.agents.planRules(projectId)),
    applyRules: (projectId: string, expectedHash: string) =>
      call<{ target: string; backupPath: string | null }>(
        A.agents.applyRules(projectId, expectedHash)
      ),
    planMcp: (projectId: string, agentId: string) =>
      call<WritePlan>(A.agents.planMcp(projectId, agentId)),
    applyMcp: (projectId: string, agentId: string, expectedHash: string) =>
      call<{ target: string; backupPath: string | null }>(
        A.agents.applyMcp(projectId, agentId, expectedHash)
      )
  },
  conv: {
    import: (
      projectId: string,
      opts: { force?: boolean; matchDirs?: string[]; titleKeywords?: string[] } = {}
    ) =>
      call<
        | {
            zcode: { imported: number; updated: number; alreadyImported: number }
            codex: { imported: number; updated: number; alreadyImported: number }
            claudeCode: { imported: number; updated: number; alreadyImported: number }
            found: { zcode: number; codex: number; claudeCode: number }
          }
        | { busy: true }
      >(A.conv.import(projectId, opts)),
    list: (projectId: string) => call<ConversationRow[]>(A.conv.list(projectId)),
    messages: (conversationId: string) => call<MessageRow[]>(A.conv.messages(conversationId)),
    search: (q: { query: string; projectId?: string; agentId?: string; sinceDays?: number }) =>
      call<SearchHit[]>(A.conv.search(q)),
    /** Subscribe to live import progress (manual + background). Returns unsubscribe. */
    onProgress: (cb: (p: ConvProgress) => void): (() => void) => A.conv.onProgress(cb)
  },
  files: {
    events: (projectId: string) => call<FileEventRow[]>(A.files.events(projectId)),
    git: (rootPath: string) => call<GitStatus>(A.files.git(rootPath))
  },
  data: {
    backup: () => call<{ file: string }>(A.data.backup()),
    listBackups: () => call<Array<{ name: string; file: string }>>(A.data.listBackups()),
    restore: (name: string) => call<{ restoredFrom: string }>(A.data.restore(name))
  },
  handoffs: {
    latest: (projectId: string) => call<HandoffRow | null>(A.handoffs.latest(projectId))
  },
  doctor: {
    run: () => call<DoctorFinding[]>(A.doctor.run())
  },
  update: {
    check: () => call<unknown>(A.update.check()),
    openRelease: (version: string) => call<boolean>(A.update.openRelease(version))
  },
  appInfo: A.appInfo as { isE2E: boolean }
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

export interface DoctorFinding {
  group: string
  name: string
  status: 'ok' | 'warn' | 'fail'
  detail?: string
}

export interface ConvProgress {
  phase?: 'done'
  agent?: string
  done?: number
  total?: number
  title?: string
  projectName?: string
}

export interface ConversationRow {
  id: string
  projectId: string
  agentId: string
  externalId: string | null
  title: string | null
  sourcePath: string | null
  startedAt: string | null
  importedAt: string
  messageCount: number
}

export interface MessageRow {
  id: string
  role: string
  content: string | null
  sequence: number
  timestamp: string | null
}

export interface SearchHit {
  snippet: string
  role: string
  timestamp: string | null
  conversationId: string
  conversationTitle: string | null
  agentId: string
  sourcePath: string | null
}

export interface FileEventRow {
  id: string
  relativePath: string
  eventType: string
  agentId: string | null
  timestamp: string
}

export interface GitStatus {
  isRepo: boolean
  branch: string | null
  clean: boolean
  changedFiles: string[]
  recentCommits: Array<{ hash: string; author: string; date: string; subject: string }>
}

export interface WritePlan {
  target: string
  current: string | null
  next: string
  backupPath: string | null
  preview: { added: number; removed: number }
}

export interface AgentsStatus {
  project: { id: string; name: string; rootPath: string }
  agents: Array<{
    id: string
    displayName: string
    installed: boolean
    rulesPath: string
    rulesWritten: boolean
    mcp: { configured: boolean; path: string; shadowed: boolean; shadowedBy?: string }
  }>
}
