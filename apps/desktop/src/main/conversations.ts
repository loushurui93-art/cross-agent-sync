/**
 * Conversation IPC: import from both agents' local stores (read-only
 * sources), list/browse, and FTS search.
 */

import type { Db } from '@cross-agent-sync/database'
import {
  importProjectConversations,
  listConversations,
  listMessages,
  searchMessages
} from '@cross-agent-sync/conversation'
import * as core from '@cross-agent-sync/core'

export function importForProject(db: Db, projectId: string): unknown {
  const p = core.getProject(db, projectId)
  const summary = importProjectConversations(db, { id: p.id, rootPath: p.rootPath })
  core.logAudit(db, {
    projectId,
    actorType: 'user',
    action: 'conversations.imported',
    targetType: 'project',
    targetId: projectId,
    details: summary as unknown as Record<string, unknown>
  })
  return summary
}

export function listForProject(db: Db, projectId: string): unknown {
  return listConversations(db, projectId)
}

export function messagesOf(db: Db, conversationId: string): unknown {
  return listMessages(db, conversationId)
}

export function search(db: Db, q: { query: string; projectId?: string; limit?: number }): unknown {
  return searchMessages(db, q)
}
