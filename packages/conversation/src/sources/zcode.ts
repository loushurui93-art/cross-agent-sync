/**
 * ZCode conversation source — reads `~/.zcode/cli/db/db.sqlite` strictly
 * read-only. Ported from the frozen agentsync project's reverse-engineered
 * reader (docs/FORMAT-zcode.md): semantics.origin=real_user filters out
 * injected context; parts ordered by sequence.
 */

import { DatabaseSync } from 'node:sqlite'
import { existsSync } from 'node:fs'
import type { NormalizedConversation, NormalizedMessage, NormalizedPart, SourceSummary } from '../model'
import { makeTitle } from './codex'

export function listZcodeSessions(dbPath: string, cwd?: string): SourceSummary[] {
  if (!existsSync(dbPath)) return []
  const sqlite = new DatabaseSync(dbPath, { readOnly: true })
  try {
    const SELECT_LIST =
      "SELECT id, COALESCE(title, '') AS title, COALESCE(path, COALESCE(directory, '')) AS cwd, " +
      'COALESCE(time_updated, time_created, 0) AS updated FROM session '
    const rows = cwd
      ? sqlite
          .prepare(
            SELECT_LIST +
              'WHERE time_deleted IS NULL AND parent_id IS NULL AND cwd = ? ORDER BY updated DESC'
          )
          .all(cwd)
      : sqlite
          .prepare(
            SELECT_LIST + 'WHERE time_deleted IS NULL AND parent_id IS NULL ORDER BY updated DESC'
          )
          .all()
    return (rows as Array<Record<string, unknown>>).map((r) => ({
      externalId: String(r.id),
      title: String(r.title ?? ''),
      sourcePath: dbPath,
      cwd: String(r.cwd ?? ''),
      updatedAt: Number(r.updated ?? 0)
    }))
  } finally {
    sqlite.close()
  }
}

export function loadZcodeSession(dbPath: string, sessionId: string): NormalizedConversation {
  const sqlite = new DatabaseSync(dbPath, { readOnly: true })
  try {
    const session = sqlite
      .prepare(
        "SELECT id, COALESCE(title, '') AS title, COALESCE(time_created, 0) AS started FROM session WHERE id = ?"
      )
      .get(sessionId) as Record<string, unknown> | undefined
    if (!session) throw new Error(`zcode session ${sessionId} not found`)

    const messages = sqlite
      .prepare(
        'SELECT id, data, COALESCE(time_created, 0) AS ts FROM message ' +
          'WHERE session_id = ? ORDER BY sequence, time_created'
      )
      .all(sessionId) as Array<Record<string, unknown>>

    const out: NormalizedMessage[] = []
    for (const row of messages) {
      let data: Record<string, unknown>
      try {
        data = JSON.parse(String(row.data)) as Record<string, unknown>
      } catch {
        continue
      }
      const role = String(data.role ?? '')
      const keep =
        role === 'assistant' ||
        (role === 'user' &&
          // semantics filter: only genuine prompts (FORMAT-zcode.md)
          ((data.semantics as Record<string, unknown> | undefined)?.origin ?? 'real_user') ===
            'real_user' &&
          data.synthetic !== true)
      if (!keep) continue

      const parts: NormalizedPart[] = []
      const partRows = sqlite
        .prepare('SELECT data FROM part WHERE message_id = ? ORDER BY sequence, time_created')
        .all(String(row.id)) as Array<Record<string, unknown>>
      for (const p of partRows) {
        let pd: Record<string, unknown>
        try {
          pd = JSON.parse(String(p.data)) as Record<string, unknown>
        } catch {
          continue
        }
        const type = String(pd.type ?? '')
        if (type === 'text' && typeof pd.text === 'string' && pd.synthetic !== true) {
          parts.push({ type: 'text', text: pd.text })
        } else if (type === 'tool') {
          const state = pd.state as Record<string, unknown> | undefined
          const input = state?.input as Record<string, unknown> | undefined
          const output = typeof state?.output === 'string' ? state.output : undefined
          parts.push({
            type: 'tool-call',
            toolName: String(pd.tool ?? 'tool'),
            text: [
              `[tool ${String(pd.tool ?? '')}]`,
              input ? summarizeInput(input) : '',
              output ? `→ ${output.slice(0, 500)}` : ''
            ]
              .filter(Boolean)
              .join(' ')
          })
        }
      }
      if (parts.length === 0) continue
      out.push({
        externalId: String(row.id),
        role: role === 'assistant' ? 'assistant' : 'user',
        parts,
        timestamp: Number(row.ts ?? 0),
        sequence: out.length
      })
    }

    return {
      externalId: sessionId,
      title: makeTitle(String(session.title ?? '') || firstUserText(out)),
      sourcePath: dbPath,
      startedAt: Number(session.started ?? 0),
      messages: out
    }
  } finally {
    sqlite.close()
  }
}

function firstUserText(msgs: NormalizedMessage[]): string {
  for (const m of msgs) {
    if (m.role === 'user') {
      const t = (m.parts ?? []).find((p) => p.type === 'text' && p.text)?.text
      if (t) return t.slice(0, 80)
    }
  }
  return ''
}

function summarizeInput(input: Record<string, unknown>): string {
  const cmd = input.command ?? input.path ?? input.pattern ?? input.query
  if (typeof cmd === 'string') return cmd.slice(0, 200)
  return JSON.stringify(input).slice(0, 200)
}
