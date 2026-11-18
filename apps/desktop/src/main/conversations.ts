/**
 * Conversation IPC: import from both agents' local stores (read-only
 * sources), list/browse, and FTS search.
 *
 * - Auto-import runs at startup and after a project is created (cheap mode).
 * - A process-wide mutex keeps manual and automatic imports from racing.
 * - Progress is broadcast to all windows so the UI can show live status.
 */

import { join } from 'node:path'
import { app, webContents } from 'electron'
import type { Db } from '@cross-agent-sync/database'
import {
  importProjectConversations,
  listConversations,
  listMessages,
  searchMessages
} from '@cross-agent-sync/conversation'
import * as core from '@cross-agent-sync/core'

function scanCachePath(): string {
  return join(app.getPath('userData'), 'codex-scan-cache.json')
}

let importRunning = false

function broadcastProgress(p: unknown): void {
  for (const wc of webContents.getAllWebContents()) {
    if (!wc.isDestroyed()) wc.send('conv:progress', p)
  }
}

export async function importForProject(
  db: Db,
  projectId: string,
  opts: { force?: boolean; matchDirs?: string[]; titleKeywords?: string[] } = {}
): Promise<unknown> {
  if (importRunning) return { busy: true }
  const p = core.getProject(db, projectId)
  importRunning = true
  try {
    const summary = await importProjectConversations(
      db,
      { id: p.id, rootPath: p.rootPath },
      {
        force: opts.force,
        matchDirs: opts.matchDirs,
        titleKeywords: opts.titleKeywords,
        scanCachePath: scanCachePath(),
        onProgress: (prog) => broadcastProgress({ ...prog, projectName: p.name })
      }
    )
    core.logAudit(db, {
      projectId,
      actorType: 'user',
      action: opts.force ? 'conversations.imported' : 'conversations.autoImported',
      targetType: 'project',
      targetId: projectId,
      details: summary as unknown as Record<string, unknown>
    })
    broadcastProgress({ phase: 'done', projectName: p.name })
    return summary
  } finally {
    importRunning = false
  }
}

/** Startup / post-create hook: import every project, cheap mode. */
export async function autoImportAll(getDb: () => Db): Promise<void> {
  if (importRunning) return
  importRunning = true
  try {
    for (const p of core.listProjects(getDb())) {
      try {
        const s = await importProjectConversations(
          getDb(),
          { id: p.id, rootPath: p.rootPath },
          {
            scanCachePath: scanCachePath(),
            onProgress: (prog) => broadcastProgress({ ...prog, projectName: p.name })
          }
        )
        const n = s.zcode.imported + s.codex.imported + s.zcode.updated + s.codex.updated
        if (n > 0) {
          console.log(
            `[main] auto-import "${p.name}": +${n} (z ${s.zcode.imported + s.zcode.updated}/c ${s.codex.imported + s.codex.updated}/k ${s.claudeCode.imported + s.claudeCode.updated})`
          )
        }
      } catch (e) {
        console.warn(`[main] auto-import failed for "${p.name}":`, e)
      }
    }
  } finally {
    importRunning = false
  }
}

export function listForProject(db: Db, projectId: string): unknown {
  return listConversations(db, projectId)
}

export function messagesOf(db: Db, conversationId: string): unknown {
  return listMessages(db, conversationId)
}

export function search(
  db: Db,
  q: { query: string; projectId?: string; agentId?: string; sinceDays?: number; limit?: number }
): unknown {
  return searchMessages(db, q)
}
