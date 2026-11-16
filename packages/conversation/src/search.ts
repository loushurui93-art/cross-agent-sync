/**
 * Full-text search over imported messages (guide §7.4, §11). Results carry
 * the snippet, project, agent, conversation title, time and source file.
 *
 * The FTS5 index uses the trigram tokenizer (CJK-friendly); queries shorter
 * than three characters fall back to a LIKE scan, which is fine at the
 * message volumes a single machine produces.
 */

import type { Db } from '@cross-agent-sync/database'

export interface SearchHit {
  snippet: string
  role: string
  timestamp: string | null
  conversationId: string
  conversationTitle: string | null
  externalId: string | null
  agentId: string
  projectId: string
  sourcePath: string | null
}

const JOINED_COLUMNS = `m.role, m.timestamp,
         c.id AS conversationId, c.title AS conversationTitle,
         c.external_id AS externalId, c.agent_id AS agentId,
         c.project_id AS projectId, c.source_path AS sourcePath`

export function searchMessages(
  db: Db,
  opts: { query: string; projectId?: string; limit?: number }
): SearchHit[] {
  const limit = Math.min(opts.limit ?? 50, 200)
  const q = opts.query.trim()
  if (!q) return []

  if ([...q].length >= 3) {
    // trigram MATCH: phrase-quote to avoid user syntax errors
    const phrase = `"${q.replace(/"/g, '""')}"`
    const where = opts.projectId
      ? 'WHERE messages_fts MATCH ? AND c.project_id = ?'
      : 'WHERE messages_fts MATCH ?'
    const params = opts.projectId ? [phrase, opts.projectId, limit] : [phrase, limit]
    return db.all<SearchHit>(
      `SELECT snippet(messages_fts, 0, '[', ']', '…', 16) AS snippet, ${JOINED_COLUMNS}
       FROM messages_fts f
       JOIN messages m ON m.rowid = f.rowid
       JOIN conversations c ON c.id = m.conversation_id
       ${where}
       ORDER BY rank
       LIMIT ?`,
      params
    )
  }

  // short-query fallback: LIKE scan with a hand-built snippet
  const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`
  const where = opts.projectId
    ? 'WHERE m.content LIKE ? ESCAPE \'\\\' AND c.project_id = ?'
    : 'WHERE m.content LIKE ? ESCAPE \'\\\''
  const params = opts.projectId ? [like, opts.projectId, limit] : [like, limit]
  const rows = db.all<SearchHit & { content: string | null }>(
    `SELECT m.content, ${JOINED_COLUMNS}
     FROM messages m
     JOIN conversations c ON c.id = m.conversation_id
     ${where}
     ORDER BY m.timestamp DESC
     LIMIT ?`,
    params
  )
  return rows.map(({ content, ...r }) => ({ ...r, snippet: makeSnippet(content, q) }))
}

function makeSnippet(content: string | null, q: string): string {
  if (!content) return ''
  const idx = content.indexOf(q)
  if (idx < 0) return content.slice(0, 60)
  const start = Math.max(0, idx - 20)
  return `${start > 0 ? '…' : ''}${content.slice(start, idx + q.length + 40)}…`
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

export function listConversations(db: Db, projectId: string): ConversationRow[] {
  return db.all<ConversationRow>(
    `SELECT c.id, c.project_id AS "projectId", c.agent_id AS "agentId",
            c.external_id AS "externalId", c.title, c.source_path AS "sourcePath",
            c.started_at AS "startedAt", c.imported_at AS "importedAt",
            (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id) AS messageCount
     FROM conversations c WHERE c.project_id = ? ORDER BY c.imported_at DESC`,
    [projectId]
  )
}

export interface MessageRow {
  id: string
  role: string
  content: string | null
  sequence: number
  timestamp: string | null
}

export function listMessages(db: Db, conversationId: string): MessageRow[] {
  return db.all<MessageRow>(
    `SELECT id, role, content, sequence, timestamp
     FROM messages WHERE conversation_id = ? ORDER BY sequence`,
    [conversationId]
  )
}
