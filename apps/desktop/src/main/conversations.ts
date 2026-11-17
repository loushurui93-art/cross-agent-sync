/**
 * Conversation IPC: import from both agents' local stores (read-only
 * sources), list/browse, and FTS search. Auto-import runs at startup and
 * after a project is created (cheap mode: scan cache + skip imported).
 */

import { join } from 'node:path'
import { app } from 'electron'
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

export async function importForProject(db: Db, projectId: string, force = false): Promise<unknown> {
  const p = core.getProject(db, projectId)
  const summary = await importProjectConversations(
    db,
    { id: p.id, rootPath: p.rootPath },
    { force, scanCachePath: scanCachePath() }
  )
  core.logAudit(db, {
    projectId,
    actorType: 'user',
    action: force ? 'conversations.imported' : 'conversations.autoImported',
    targetType: 'project',
    targetId: projectId,
    details: summary as unknown as Record<string, unknown>
  })
  return summary
}

/** Startup / post-create hook: import every project, cheap mode. */
export async function autoImportAll(getDb: () => Db): Promise<void> {
  try {
    for (const p of core.listProjects(getDb())) {
      try {
        const s = await importProjectConversations(
          getDb(),
          { id: p.id, rootPath: p.rootPath },
          { scanCachePath: scanCachePath() }
        )
        const n = s.zcode.imported + s.codex.imported + s.zcode.updated + s.codex.updated
        if (n > 0) {
          console.log(
            `[main] auto-import "${p.name}": +${n} (z ${s.zcode.imported + s.zcode.updated}/c ${s.codex.imported + s.codex.updated})`
          )
        }
      } catch (e) {
        console.warn(`[main] auto-import failed for "${p.name}":`, e)
      }
    }
  } catch (e) {
    console.warn('[main] auto-import failed:', e)
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
