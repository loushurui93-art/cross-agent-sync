/**
 * Codex conversation source — parses rollout JSONL (plain or zstd) under
 * `~/.codex/sessions/`. Ported from the frozen agentsync reader
 * (docs/FORMAT-codex.md): envelope lines, response_item messages and
 * call_id-paired tool results.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { decompress } from 'fzstd'
import type { NormalizedConversation, NormalizedMessage, NormalizedPart, SourceSummary } from '../model'

interface Envelope {
  timestamp?: string
  type?: string
  payload?: Record<string, unknown>
}

export function listCodexThreads(sessionsDir: string, cwd?: string): SourceSummary[] {
  if (!existsSync(sessionsDir)) return []
  const out: SourceSummary[] = []
  walk(sessionsDir, (abs) => {
    const id = threadIdFromFilename(abs)
    if (!id) return
    let meta: { cwd?: string; updated: number; title: string } | null = null
    try {
      meta = readHeader(abs)
    } catch {
      return
    }
    if (cwd && norm(meta.cwd ?? '') !== norm(cwd)) return
    out.push({
      externalId: id,
      title: '',
      sourcePath: abs,
      cwd: meta.cwd ?? '',
      updatedAt: meta.updated
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
      const text = (content ?? [])
        .map((c) => String(c.text ?? ''))
        .filter(Boolean)
        .join('\n')
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

  const title =
    messages.find((m) => m.role === 'user')?.parts?.find((p) => p.type === 'text')?.text ?? ''
  return {
    externalId: id,
    title: title.slice(0, 80) || '(untitled)',
    sourcePath: path,
    startedAt,
    messages
  }
}

function readHeader(abs: string): { cwd?: string; updated: number; title: string } {
  const text = readRolloutText(abs)
  const lines = text.split('\n').filter((l) => l.trim())
  let cwd: string | undefined
  let updated = 0
  for (const line of lines) {
    try {
      const env = JSON.parse(line) as Envelope
      const ts = env.timestamp ? Date.parse(env.timestamp) || 0 : 0
      updated = Math.max(updated, ts)
      if (env.type === 'session_meta' && env.payload) {
        cwd = String(env.payload.cwd ?? '')
      }
    } catch {
      continue
    }
  }
  return { cwd, updated, title: '' }
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
