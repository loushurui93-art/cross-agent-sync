/**
 * Import pipeline (guide §11.3): normalize → dedupe (agent + external id,
 * guarded by source hash) → transactional write → FTS via triggers.
 * Failures never delete or touch the source files.
 */

import { createHash, randomUUID } from 'node:crypto'
import type { Db } from '@cross-agent-sync/database'
import { nowIso } from '@cross-agent-sync/shared'
import { messagePlainText, PARSER_VERSION, type NormalizedConversation } from './model'

export const AGENT_IDS = ['zcode', 'codex', 'claude-code'] as const
export type AgentId = (typeof AGENT_IDS)[number]

/** Seed the known agents (id = kind). */
export function ensureAgents(db: Db): void {
  const now = nowIso()
  const names: Record<AgentId, string> = {
    zcode: 'ZCode',
    codex: 'Codex',
    'claude-code': 'Claude Code'
  }
  for (const id of AGENT_IDS) {
    db.run(
      'INSERT INTO agents (id, type, display_name, enabled, created_at, updated_at) ' +
        'VALUES (?, ?, ?, 1, ?, ?) ON CONFLICT(id) DO NOTHING',
      [id, id, names[id], now, now]
    )
  }
}

export function sourceHash(conv: NormalizedConversation): string {
  return createHash('sha256')
    .update(conv.externalId)
    .update('\u0000')
    .update(String(conv.messages.length))
    .update('\u0000')
    .update(conv.messages.map(messagePlainText).join('\u0001'))
    .digest('hex')
}

export interface ImportOutcome {
  imported: boolean
  /** true when an existing conversation was replaced with fresher content */
  updated?: boolean
  conversationId?: string
  reason?: 'already-imported' | 'updated' | 'empty'
}

export function importConversation(
  db: Db,
  projectId: string,
  agentId: AgentId,
  conv: NormalizedConversation
): ImportOutcome {
  ensureAgents(db)
  if (conv.messages.length === 0) return { imported: false, reason: 'empty' }

  const hash = sourceHash(conv)
  const existing = db.get<{ id: string; sourceHash: string | null }>(
    'SELECT id, source_hash AS "sourceHash" FROM conversations WHERE agent_id = ? AND external_id = ?',
    [agentId, conv.externalId]
  )
  if (existing) {
    if (existing.sourceHash === hash) return { imported: false, reason: 'already-imported' }
    // source grew since the last import (sessions are append-only): replace
    replaceConversationRows(db, existing.id, conv, hash)
    return { imported: true, updated: true, reason: 'updated', conversationId: existing.id }
  }

  const conversationId = randomUUID()
  db.transaction(() => {
    db.run(
      'INSERT INTO conversations (id, project_id, agent_id, external_id, title, source_path, started_at, imported_at, source_hash) ' +
        'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        conversationId,
        projectId,
        agentId,
        conv.externalId,
        conv.title ?? null,
        conv.sourcePath,
        conv.startedAt ? new Date(conv.startedAt).toISOString() : null,
        nowIso(),
        hash
      ]
    )
    insertMessages(db, conversationId, conv)
  })
  return { imported: true, conversationId }
}

function replaceConversationRows(
  db: Db,
  conversationId: string,
  conv: NormalizedConversation,
  hash: string
): void {
  db.transaction(() => {
    db.run('DELETE FROM messages WHERE conversation_id = ?', [conversationId])
    db.run(
      'UPDATE conversations SET title = ?, source_hash = ?, imported_at = ?, started_at = ? WHERE id = ?',
      [
        conv.title ?? null,
        hash,
        nowIso(),
        conv.startedAt ? new Date(conv.startedAt).toISOString() : null,
        conversationId
      ]
    )
    insertMessages(db, conversationId, conv)
  })
}

function insertMessages(db: Db, conversationId: string, conv: NormalizedConversation): void {
  for (const m of conv.messages) {
    const text = messagePlainText(m)
    db.run(
      'INSERT INTO messages (id, conversation_id, external_id, role, content, content_json, sequence, timestamp) ' +
        'VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [
        randomUUID(),
        conversationId,
        m.externalId ?? null,
        m.role,
        text || null,
        m.parts ? JSON.stringify({ parts: m.parts, parser: PARSER_VERSION }) : null,
        m.sequence,
        m.timestamp ? new Date(m.timestamp).toISOString() : null
      ]
    )
  }
}

export interface ImportSummary {
  imported: number
  updated: number
  alreadyImported: number
  changedSkipped: number
  empty: number
}

export function importMany(
  db: Db,
  projectId: string,
  agentId: AgentId,
  convs: NormalizedConversation[]
): ImportSummary {
  const s: ImportSummary = {
    imported: 0,
    updated: 0,
    alreadyImported: 0,
    changedSkipped: 0,
    empty: 0
  }
  for (const c of convs) {
    const r = importConversation(db, projectId, agentId, c)
    if (r.updated) s.updated++
    else if (r.imported) s.imported++
    else if (r.reason === 'already-imported') s.alreadyImported++
    else s.empty++
  }
  return s
}
