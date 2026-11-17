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

  // ---- enumerate sources (cheap; cache-accelerated) ---------------------
  const zDbPath = join(zhome, 'cli', 'db', 'db.sqlite')
  const zAll = listZcodeSessions(zDbPath).filter((s) => normalize(s.cwd) === root)

  let cache: ScanCache | undefined
  if (opts.scanCachePath) {
    cache = loadScanCacheFile(opts.scanCachePath)
  }
  const cAll = listCodexThreads(join(chome, 'sessions'), undefined, cache)
  const cMatched = cAll.filter((t) => {
    const c = normalize(t.cwd)
    return c === root || c.startsWith(`${root}/`)
  })
  const kAll = listClaudeSessions(claudeHome, undefined, cache)
  const kMatched = kAll.filter((t) => {
    const c = normalize(t.cwd)
    return c === root || c.startsWith(`${root}/`)
  })
  if (opts.scanCachePath && cache) {
    // prune entries for sources that no longer exist, then persist
    const alive = new Set([...cAll, ...kAll].map((t) => t.sourcePath))
    for (const p of Object.keys(cache)) {
      if (!alive.has(p)) delete cache[p]
    }
    saveScanCacheFile(opts.scanCachePath, cache)
  }

  // ---- chunked load + import (yields between conversations) -------------
  const importChunked = async (
    agentId: AgentId,
    sources: Array<{ externalId: string; sourcePath: string }>,
    load: (s: { externalId: string; sourcePath: string }) => Parameters<typeof importConversation>[3]
  ): Promise<ImportSummary> => {
    const summary = emptySummary()
    const skip = opts.force ? new Set<string>() : alreadyImported(db, project.id, agentId)
    const todo = sources.filter((s) => !skip.has(s.externalId)).slice(0, limit)
    for (const s of todo) {
      await yieldToEventLoop()
      try {
        const r = importConversation(db, project.id, agentId, load(s))
        if (r.updated) summary.updated++
        else if (r.imported) summary.imported++
        else if (r.reason === 'already-imported') summary.alreadyImported++
        else summary.empty++
      } catch (e) {
        // one broken source must not abort the whole import
        console.warn(`[import] ${agentId}:${s.externalId} failed:`, e)
        summary.empty++
      }
    }
    return summary
  }

  const zSummary = await importChunked('zcode', zAll, (s) =>
    loadZcodeSession(zDbPath, s.externalId)
  )
  const cSummary = await importChunked('codex', cMatched, (s) => loadCodexThread(s.sourcePath))
  const kSummary = await importChunked(
    'claude-code',
    kMatched,
    (s) => loadClaudeSession(s.sourcePath)
  )

  return {
    zcode: zSummary,
    codex: cSummary,
    claudeCode: kSummary,
    found: { zcode: zAll.length, codex: cMatched.length, claudeCode: kMatched.length }
  }
}
