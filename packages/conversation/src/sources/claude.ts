/**
 * Claude Code conversation source — reads `~/.claude/projects/<encoded>/
 * <uuid>.jsonl` strictly read-only. Line shapes verified on-machine:
 * {type:"user"|"assistant", message:{role, content: string|blocks}, cwd,
 *  timestamp, isSidechain?}; assistant blocks: thinking/text/tool_use;
 * user blocks: string | text/tool_result; ai-title lines carry titles.
 * Subagent sidechains (isSidechain:true) are skipped as internal noise.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { NormalizedConversation, NormalizedPart, SourceSummary } from '../model'
import { makeTitle } from './codex'
import type { ScanCache } from './codex'

interface ClaudeLine {
  type?: string
  sessionId?: string
  cwd?: string
  timestamp?: string
  isSidechain?: boolean
  title?: string
  message?: {
    role?: string
    content?: string | Array<{ type?: string; text?: string; name?: string; input?: unknown }>
  }
}

export function listClaudeSessions(claudeHome: string, cwd?: string, cache?: ScanCache): SourceSummary[] {
  const projectsDir = join(claudeHome, 'projects')
  if (!existsSync(projectsDir)) return []
  const out: SourceSummary[] = []
  for (const dir of readdirSync(projectsDir, { withFileTypes: true })) {
    if (!dir.isDirectory()) continue
    const dirPath = join(projectsDir, dir.name)
    for (const f of readdirSync(dirPath, { withFileTypes: true })) {
      if (!f.isFile() || !f.name.endsWith('.jsonl')) continue
      const abs = join(dirPath, f.name)
      const id = f.name.replace(/\.jsonl$/, '')
      let meta: { cwd: string; updated: number; title: string }
      if (cache) {
        try {
          const st = statSync(abs)
          const hit = cache[abs]
          if (hit && hit.mtimeMs === st.mtimeMs && hit.size === st.size) {
            meta = { cwd: hit.cwd, updated: st.mtimeMs, title: '' }
            push()
            continue
          }
        } catch {
          /* fall through */
        }
      }
      try {
        meta = readHeader(abs)
      } catch {
        continue
      }
      if (cache) {
        try {
          const st = statSync(abs)
          cache[abs] = { mtimeMs: st.mtimeMs, size: st.size, cwd: meta.cwd }
        } catch {
          /* ignore */
        }
      }
      push()

      function push(): void {
        if (cwd && norm(meta.cwd) !== norm(cwd)) return
        out.push({
          externalId: id,
          title: meta.title,
          sourcePath: abs,
          cwd: meta.cwd,
          updatedAt: meta.updated
        })
      }
    }
  }
  out.sort((a, b) => b.updatedAt - a.updatedAt)
  return out
}

export function loadClaudeSession(abs: string): NormalizedConversation {
  const text = readFileSync(abs, 'utf8')
  const messages: NormalizedMessage2[] = []
  let startedAt = 0
  let title = ''

  for (const line of text.split('\n')) {
    if (!line.trim()) continue
    let env: ClaudeLine
    try {
      env = JSON.parse(line) as ClaudeLine
    } catch {
      continue
    }
    if (env.type === 'ai-title' && env.title) {
      title = env.title
      continue
    }
    if (env.type !== 'user' && env.type !== 'assistant') continue
    if (env.isSidechain) continue
    const msg = env.message
    if (!msg) continue
    const ts = env.timestamp ? Date.parse(env.timestamp) || 0 : 0
    if (!startedAt && ts) startedAt = ts
    const role = env.type === 'user' ? 'user' : 'assistant'

    if (typeof msg.content === 'string') {
      const t = msg.content.trim()
      if (!t) continue
      messages.push({ role, parts: [{ type: 'text', text: t }], timestamp: ts, sequence: messages.length })
      continue
    }
    const parts: NormalizedPart[] = []
    for (const b of msg.content ?? []) {
      const bt = b.type ?? ''
      if (bt === 'text' && b.text?.trim()) {
        parts.push({ type: 'text', text: b.text })
      } else if (bt === 'tool_use') {
        parts.push({
          type: 'tool-call',
          toolName: b.name ?? 'tool',
          text: `[tool ${b.name ?? ''}] ${JSON.stringify(b.input ?? {}).slice(0, 200)}`
        })
      } else if (bt === 'tool_result') {
        // tool_result content may be string or blocks; keep a short tail
        const inner = b as unknown as { content?: unknown }
        let t = ''
        if (typeof inner.content === 'string') t = inner.content
        else if (Array.isArray(inner.content)) {
          t = (inner.content as Array<{ text?: string }>).map((c) => c.text ?? '').join('\n')
        }
        if (t) parts.push({ type: 'tool-result', text: `→ ${t.slice(0, 400)}` })
      }
      // thinking blocks intentionally dropped (internal reasoning noise)
    }
    if (parts.length === 0) continue
    messages.push({ role, parts, timestamp: ts, sequence: messages.length })
  }

  const fallback =
    messages.find((m) => m.role === 'user')?.parts?.find((p) => p.type === 'text')?.text ?? ''
  return {
    externalId: abs.split(/[\\/]/).pop()?.replace(/\.jsonl$/, '') ?? abs,
    title: title || makeTitle(fallback),
    sourcePath: abs,
    startedAt,
    messages
  }
}

interface NormalizedMessage2 {
  role: 'user' | 'assistant'
  parts: NormalizedPart[]
  timestamp: number
  sequence: number
}

function readHeader(abs: string): { cwd: string; updated: number; title: string } {
  // scan a bounded prefix — cwd/timestamp/title appear early in practice
  const bytes = readFileSync(abs)
  const text = new TextDecoder().decode(bytes.subarray(0, 1_048_576))
  let cwd = ''
  let title = ''
  for (const line of text.split('\n')) {
    if (!line.trim()) continue
    try {
      const env = JSON.parse(line) as ClaudeLine
      if (!cwd && env.cwd) cwd = env.cwd
      if (!title && env.type === 'ai-title' && env.title) title = env.title
      if (cwd) break
    } catch {
      continue
    }
  }
  let updated = 0
  try {
    updated = statSync(abs).mtimeMs
  } catch {
    /* ignore */
  }
  return { cwd, updated, title }
}

function norm(p: string): string {
  return p
    .replace(/^\\\\\?\\/i, '')
    .replace(/\\/g, '/')
    .replace(/\/+$/, '')
    .toLowerCase()
}
