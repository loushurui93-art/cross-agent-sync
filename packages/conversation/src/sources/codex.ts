/**
 * Codex conversation source — parses rollout JSONL (plain or zstd) under
 * `~/.codex/sessions/`. Ported from the frozen agentsync reader
 * (docs/FORMAT-codex.md): envelope lines, response_item messages and
 * call_id-paired tool results.
 */

import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { decompress } from 'fzstd'
import type { NormalizedConversation, NormalizedMessage, NormalizedPart, SourceSummary } from '../model'

interface Envelope {
  timestamp?: string
  type?: string
  payload?: Record<string, unknown>
}

/** Scan cache: path → { mtimeMs, size, cwd } so unchanged rollouts are not re-parsed. */
export interface ScanCache {
  [path: string]: { mtimeMs: number; size: number; cwd: string }
}

export function loadScanCacheFile(file: string): ScanCache {
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as ScanCache
  } catch {
    return {}
  }
}

export function saveScanCacheFile(file: string, cache: ScanCache): void {
  try {
    writeFileSync(file, JSON.stringify(cache), 'utf8')
  } catch {
    /* best effort */
  }
}

export function listCodexThreads(
  sessionsDir: string,
  cwd?: string,
  cache?: ScanCache
): SourceSummary[] {
  if (!existsSync(sessionsDir)) return []
  const out: SourceSummary[] = []
  walk(sessionsDir, (abs) => {
    const id = threadIdFromFilename(abs)
    if (!id) return
    let cwdStr: string | undefined
    let updated = 0
    let cached = false
    if (cache) {
      try {
        const st = statSync(abs)
        const hit = cache[abs]
        if (hit && hit.mtimeMs === st.mtimeMs && hit.size === st.size) {
          cwdStr = hit.cwd
          updated = st.mtimeMs
          cached = true
        }
      } catch {
        /* fall through to parse */
      }
    }
    if (!cached) {
      let meta: { cwd?: string; updated: number; title: string } | null = null
      try {
        meta = readHeader(abs)
      } catch {
        return
      }
      cwdStr = meta.cwd
      updated = meta.updated
      if (cache) {
        try {
          const st = statSync(abs)
          cache[abs] = { mtimeMs: st.mtimeMs, size: st.size, cwd: cwdStr ?? '' }
        } catch {
          /* ignore */
        }
      }
    }
    if (cwd && norm(cwdStr ?? '') !== norm(cwd)) return
    out.push({
      externalId: id,
      title: '',
      sourcePath: abs,
      cwd: cwdStr ?? '',
      updatedAt: updated
    })
  })
  out.sort((a, b) => b.updatedAt - a.updatedAt)
  return out
}

export function loadCodexThread(path: string): NormalizedConversation {
  const text = readRolloutText(path)
  const lines = text.split('\n').filter((l) => l.trim())
  const id = threadIdFromFilename(path) ?? ''

  const messages: NormalizedMessage[] = []
  let pendingToolOutputs = new Map<string, string>()
  let startedAt = 0

  const flushAssistant = (parts: NormalizedPart[], ts: number): void => {
    if (parts.length === 0) return
    messages.push({ role: 'assistant', parts, timestamp: ts, sequence: messages.length })
  }

  let buf: NormalizedPart[] = []
  let bufTs = 0
  for (const line of lines) {
    let env: Envelope
    try {
      env = JSON.parse(line) as Envelope
    } catch {
      continue
    }
    const ts = env.timestamp ? Date.parse(env.timestamp) || 0 : 0
    if (env.type === 'session_meta') {
      startedAt = ts
      continue
    }
    if (env.type !== 'response_item') continue
    const p = env.payload ?? {}
    const kind = String(p.type ?? '')

    if (kind === 'message') {
      const role = String(p.role ?? '')
      const content = p.content as Array<Record<string, unknown>> | undefined
      let text = (content ?? [])
        .map((c) => String(c.text ?? ''))
        .filter(Boolean)
        .join('\n')
      if (role === 'user') {
        // Codex injects environment/instructions/attachment blocks as user
        // messages — strip them so the transcript matches what the user
        // actually typed (and titles stop looking like <environment_context>).
        text = cleanCodexUserText(text)
        if (!text) continue
      }
      if (role === 'user' && text) {
        flushAssistant(buf, bufTs)
        buf = []
        messages.push({
          role: 'user',
          parts: [{ type: 'text', text }],
          timestamp: ts,
          sequence: messages.length
        })
      } else if (role === 'assistant' && text) {
        // keep tool results grouped with the final text that follows them
        if (buf.some((p) => p.type === 'text')) {
          flushAssistant(buf, bufTs)
          buf = []
        }
        bufTs = bufTs || ts
        buf.push({ type: 'text', text })
      }
    } else if (kind === 'function_call' || kind === 'custom_tool_call') {
      if (bufTs === 0) bufTs = ts
      const callId = String(p.call_id ?? '')
      const name = String(p.name ?? 'tool')
      let args = ''
      if (typeof p.arguments === 'string') args = p.arguments.slice(0, 200)
      else if (p.input) args = JSON.stringify(p.input).slice(0, 200)
      pendingToolOutputs.set(callId, `[tool ${name}] ${args}`)
    } else if (kind === 'function_call_output' || kind === 'custom_tool_call_output') {
      const callId = String(p.call_id ?? '')
      const head = pendingToolOutputs.get(callId)
      if (!head) continue
      pendingToolOutputs.delete(callId)
      const out = p.output
      let text = ''
      if (typeof out === 'string') text = out
      else if (Array.isArray(out))
        text = (out as Array<Record<string, unknown>>).map((c) => String(c.text ?? '')).join('\n')
      buf.push({ type: 'tool-result', toolName: head, text: `${head} → ${text.slice(0, 500)}` })
      if (bufTs === 0) bufTs = ts
    }
  }
  flushAssistant(buf, bufTs)

  return {
    externalId: id,
    title: codexTitleFrom(messages),
    sourcePath: path,
    startedAt,
    messages
  }
}

/**
 * Remove Codex-injected boilerplate from user message text:
 * - `<environment_context>...</environment_context>` blocks
 * - `# AGENTS.md instructions ... <INSTRUCTIONS>...</INSTRUCTIONS>` blocks
 * - `# Files mentioned by the user:` attachment headers (keep the list)
 * - surrounding whitespace
 */
export function cleanCodexUserText(text: string): string {
  let t = text
  t = t.replace(/<environment_context>[\s\S]*?<\/environment_context>/gi, '')
  t = t.replace(
    /#\s*AGENTS\.md instructions[\s\S]*?<\/INSTRUCTIONS>\s*/gi,
    ''
  )
  t = t.replace(/<INSTRUCTIONS>[\s\S]*?<\/INSTRUCTIONS>/gi, '')
  // app/plugin signal tags (open-page etc.) — generic paired-tag sweep for
  // the <external_...> family Codex injects on desktop sessions
  t = t.replace(/<external_[a-z0-9_]+>[\s\S]*?<\/external_[a-z0-9_]+>/gi, '')
  t = t.replace(/^#\s*Files mentioned by the user:\s*/i, '')
  t = t.replace(/^##\s+/gm, '') // attachment list headers -> plain text
  t = t.replace(/\n{3,}/g, '\n\n')
  return t.trim()
}

/**
 * Display title for a Codex conversation: prefer the first substantive user
 * sentence; when the message is only an attachment list, use the first file
 * name (e.g. 实验1-2026-09.pdf) instead of the boilerplate header.
 */
export function codexTitleFrom(messages: NormalizedMessage[]): string {
  const first = messages.find((m) => m.role === 'user')
  const text = (first?.parts ?? []).find((p) => p.type === 'text')?.text ?? ''
  // attachment-only message: "xxx.pdf: path" lines
  const lines = text.split('\n').filter(Boolean)
  const nonAttach = lines.filter((l) => !/^[^:]+\.(pdf|pptx?|docx?|xlsx?|zip|md|py|ts|js):/i.test(l))
  if (nonAttach.length > 0) return makeTitle(nonAttach[0])
  const firstFile = lines[0]?.split(':')[0]?.trim()
  return firstFile ? `[附件] ${firstFile.slice(0, 60)}` : '(untitled)'
}

/** Build a display title from the first real user text (one line, capped). */
export function makeTitle(firstUserText: string): string {
  const t = firstUserText.replace(/\s+/g, ' ').trim()
  return t.slice(0, 80) || '(untitled)'
}

function readHeader(abs: string): { cwd?: string; updated: number; title: string } {
  // session_meta is always line 0 — parse only that (mtime gives last activity)
  const first = readFirstLine(abs)
  let cwd: string | undefined
  try {
    const env = JSON.parse(first) as Envelope
    if (env.type === 'session_meta' && env.payload) {
      cwd = String(env.payload.cwd ?? '')
    }
  } catch {
    /* torn head: treat as unknown */
  }
  return { cwd, updated: statMtimeMs(abs), title: '' }
}

function readFirstLine(abs: string): string {
  const bytes = readFileSync(abs)
  const text = abs.endsWith('.zst')
    ? new TextDecoder().decode(decompress(new Uint8Array(bytes)))
    : new TextDecoder().decode(bytes.subarray(0, 262144))
  return text.split('\n')[0] ?? ''
}

function statMtimeMs(abs: string): number {
  try {
    return statSync(abs).mtimeMs
  } catch {
    return 0
  }
}

function readRolloutText(path: string): string {
  const bytes = readFileSync(path)
  if (path.endsWith('.zst')) {
    return new TextDecoder().decode(decompress(new Uint8Array(bytes)))
  }
  return new TextDecoder().decode(bytes)
}

function threadIdFromFilename(name: string): string | undefined {
  const base = name.split(/[\\/]/).pop() ?? ''
  if (!base.startsWith('rollout-')) return undefined
  const stem = base.replace(/\.jsonl\.zst$/, '').replace(/\.jsonl$/, '')
  const rest = stem.slice(20) // after 'YYYY-MM-DDTHH-MM-SS-'
  const id = rest.split('_')[0]
  return id.length >= 32 ? id : undefined
}

function walk(dir: string, fn: (abs: string) => void): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name)
    if (entry.isDirectory()) walk(abs, fn)
    else if (entry.name.startsWith('rollout-')) fn(abs)
  }
}

function norm(p: string): string {
  return p
    .replace(/^\\\\\?\\/, '') // Windows extended-length prefix used by Codex
    .replace(/^\\/g, '')
    .replace(/\/+$/, '')
    .toLowerCase()
}

export { norm as normalizePath, dirname }
