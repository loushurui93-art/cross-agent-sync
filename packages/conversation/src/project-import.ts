/**
 * Per-project import orchestration: scan all agents' local stores, pick
 * sessions whose working directory belongs to the project, import them.
 *
 * Two modes:
 * - default ("auto"): cheap — sources already imported are skipped without
 *   parsing (scan cache + existing-id pre-filter), suited for startup runs;
 * - `force`: loads everything; a conversation whose source grew since the
 *   last import is replaced (hash mismatch → updated).
 *
 * The heavy per-conversation loads run in chunks separated by event-loop
 * yields so the Electron main process (and its renderer) stays responsive
 * during first-time scans of large libraries.
 */

import type { Db } from '@cross-agent-sync/database'
import { join } from 'node:path'
import { homedir } from 'node:os'
import {
  importConversation,
  type AgentId,
  type ImportSummary
} from './import'
import { listZcodeSessions, loadZcodeSession } from './sources/zcode'
import {
  listCodexThreads,
  loadCodexThread,
  loadScanCacheFile,
  saveScanCacheFile,
  type ScanCache
} from './sources/codex'
import { listClaudeSessions, loadClaudeSession } from './sources/claude'

export interface DualImportSummary {
  zcode: ImportSummary
  codex: ImportSummary
  claudeCode: ImportSummary
  found: { zcode: number; codex: number; claudeCode: number }
}

export interface ImportOptions {
  limit?: number
  zcodeHome?: string
  codexHome?: string
  claudeHome?: string
  /** Parse every source again and replace conversations whose source grew. */
  force?: boolean
  /** Where to keep the codex scan cache (recommended: userData). */
  scanCachePath?: string
  /** Progress hook: called after enumeration and after each conversation. */
  onProgress?: (p: ImportProgress) => void
  /**
   * Extra directories whose sessions belong to this project even though
   * their recorded cwd differs from the project root (real-world case: the
   * experiment was scattered across directories).
   */
  matchDirs?: string[]
  /**
   * When set, only conversations whose title or first user text contains at
   * least one of these keywords are imported (applies to extra-dir matches;
   * project-root matches always import).
   */
  titleKeywords?: string[]
  /**
   * Import EVERY session from all agents regardless of cwd — for sessions
   * without a clear project home (archive use-case). Title keywords still
   * apply as an optional narrow filter.
   */
  allHistory?: boolean
}

export interface ImportProgress {
  agent: AgentId | 'all'
  done: number
  total: number
  title: string
}

export type { AgentId }

function normalize(p: string): string {
  return p
    .replace(/^\\\\\?\\/i, '') // Windows extended-length prefix (Codex cwds)
    .replace(/\\/g, '/')
    .replace(/\/+$/, '')
    .toLowerCase()
}

function alreadyImported(db: Db, projectId: string, agentId: AgentId): Set<string> {
  const rows = db.all<{ externalId: string | null }>(
    'SELECT external_id AS "externalId" FROM conversations WHERE project_id = ? AND agent_id = ?',
    [projectId, agentId]
  )
  return new Set(rows.map((r) => r.externalId).filter((x): x is string => x !== null))
}

const yieldToEventLoop = (): Promise<void> => new Promise((r) => setImmediate(r))

function emptySummary(): ImportSummary {
  return { imported: 0, updated: 0, alreadyImported: 0, changedSkipped: 0, empty: 0 }
}

export async function importProjectConversations(
  db: Db,
  project: { id: string; rootPath: string },
  opts: ImportOptions = {}
): Promise<DualImportSummary> {
  const limit = opts.limit ?? 200
  const zhome = opts.zcodeHome ?? join(homedir(), '.zcode')
  const chome = opts.codexHome ?? join(homedir(), '.codex')
  const claudeHome = opts.claudeHome ?? join(homedir(), '.claude')
  const root = normalize(project.rootPath)
  // extra directories whose sessions also belong to this project
  const dirs = [root, ...(opts.matchDirs ?? []).map(normalize)]
  const allHistory = opts.allHistory === true

  const cwdMatches = (cwd: string): boolean => {
    if (allHistory) return true
    const c = normalize(cwd)
    return dirs.some((d) => c === d || c.startsWith(`${d}/`))
  }
  /**
   * Keyword filter applies to every source in allHistory mode, and to
   * extra-dir matches in project mode; project-root matches always import.
   */
  const rootMatched = (cwd: string): boolean => !allHistory && normalize(cwd) === root

  // ---- enumerate sources (cheap; cache-accelerated) ---------------------
  const zDbPath = join(zhome, 'cli', 'db', 'db.sqlite')
  const zAll = listZcodeSessions(zDbPath).filter((s) => cwdMatches(s.cwd))

  let cache: ScanCache | undefined
  if (opts.scanCachePath) {
    cache = loadScanCacheFile(opts.scanCachePath)
  }
  const cAll = listCodexThreads(join(chome, 'sessions'), undefined, cache)
  const cMatched = cAll.filter((t) => cwdMatches(t.cwd))
  const kAll = listClaudeSessions(claudeHome, undefined, cache)
  const kMatched = kAll.filter((t) => cwdMatches(t.cwd))
  if (opts.scanCachePath && cache) {
    // prune entries for sources that no longer exist, then persist
    const alive = new Set([...cAll, ...kAll].map((t) => t.sourcePath))
    for (const p of Object.keys(cache)) {
      if (!alive.has(p)) delete cache[p]
    }
    saveScanCacheFile(opts.scanCachePath, cache)
  }

  // ---- chunked load + import (yields between conversations) -------------
  const totalAll = zAll.length + cMatched.length + kMatched.length
  let doneAll = 0
  opts.onProgress?.({
    agent: 'all',
    done: 0,
    total: totalAll,
    title: project.rootPath
  })

  const importChunked = async (
    agentId: AgentId,
    sources: Array<{ externalId: string; sourcePath: string; cwd: string }>,
    load: (s: { externalId: string; sourcePath: string }) => Parameters<typeof importConversation>[3]
  ): Promise<ImportSummary> => {
    const summary = emptySummary()
    const skip = opts.force ? new Set<string>() : alreadyImported(db, project.id, agentId)
    const todo = sources.filter((s) => !skip.has(s.externalId)).slice(0, limit)
    const keywords = opts.titleKeywords?.map((k) => k.toLowerCase()).filter(Boolean) ?? null
    let done = 0
    for (const s of todo) {
      await yieldToEventLoop()
      try {
        const conv = load(s)
        // keyword filter applies only to extra-dir matches; the project root's
        // own sessions always import
        if (keywords && !rootMatched(s.cwd)) {
          const firstUser = conv.messages.find((m) => m.role === 'user')
          const hay =
            `${conv.title}\n` +
            (firstUser?.parts ?? []).map((p) => p.text ?? '').join(' ')
          if (!keywords.some((k) => hay.toLowerCase().includes(k))) {
            done++
            doneAll++
            opts.onProgress?.({
              agent: agentId,
              done: doneAll,
              total: totalAll,
              title: s.externalId
            })
            continue
          }
        }
        const r = importConversation(db, project.id, agentId, conv)
        if (r.updated) summary.updated++
        else if (r.imported) summary.imported++
        else if (r.reason === 'already-imported') summary.alreadyImported++
        else summary.empty++
      } catch (e) {
        // one broken source must not abort the whole import
        console.warn(`[import] ${agentId}:${s.externalId} failed:`, e)
        summary.empty++
      }
      done++
      doneAll++
      opts.onProgress?.({
        agent: agentId,
        done: doneAll,
        total: totalAll,
        title: s.externalId
      })
    }
    return summary
  }

  const zSummary = await importChunked(
    'zcode',
    zAll.map((s) => ({ externalId: s.externalId, sourcePath: s.sourcePath, cwd: s.cwd })),
    (s) => loadZcodeSession(zDbPath, s.externalId)
  )
  const cSummary = await importChunked(
    'codex',
    cMatched.map((t) => ({ externalId: t.externalId, sourcePath: t.sourcePath, cwd: t.cwd })),
    (s) => loadCodexThread(s.sourcePath)
  )
  const kSummary = await importChunked(
    'claude-code',
    kMatched.map((t) => ({ externalId: t.externalId, sourcePath: t.sourcePath, cwd: t.cwd })),
    (s) => loadClaudeSession(s.sourcePath)
  )

  return {
    zcode: zSummary,
    codex: cSummary,
    claudeCode: kSummary,
    found: { zcode: zAll.length, codex: cMatched.length, claudeCode: kMatched.length }
  }
}
