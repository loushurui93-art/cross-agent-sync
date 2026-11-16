/**
 * Per-project import orchestration: scan both agents' local stores, pick
 * sessions whose working directory belongs to the project, import them.
 *
 * Two modes:
 * - default ("auto"): cheap — rollouts already imported are skipped without
 *   parsing (scan cache + existing-id pre-filter), suited for startup runs;
 * - `force`: loads everything; a conversation whose source grew since the
 *   last import is replaced (hash mismatch → updated).
 */

import type { Db } from '@cross-agent-sync/database'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { importMany, type ImportSummary } from './import'
import { listZcodeSessions, loadZcodeSession } from './sources/zcode'
import {
  listCodexThreads,
  loadCodexThread,
  loadScanCacheFile,
  saveScanCacheFile,
  type ScanCache
} from './sources/codex'

export interface DualImportSummary {
  zcode: ImportSummary
  codex: ImportSummary
  found: { zcode: number; codex: number }
}

export interface ImportOptions {
  limit?: number
  zcodeHome?: string
  codexHome?: string
  /** Parse every rollout again and replace conversations whose source grew. */
  force?: boolean
  /** Where to keep the codex scan cache (recommended: userData). */
  scanCachePath?: string
}

function normalize(p: string): string {
  return p
    .replace(/^\\\\\?\\/i, '') // Windows extended-length prefix (Codex cwds)
    .replace(/\\/g, '/')
    .replace(/\/+$/, '')
    .toLowerCase()
}

function alreadyImported(db: Db, projectId: string, agentId: 'zcode' | 'codex'): Set<string> {
  const rows = db.all<{ externalId: string | null }>(
    'SELECT external_id AS "externalId" FROM conversations WHERE project_id = ? AND agent_id = ?',
    [projectId, agentId]
  )
  return new Set(rows.map((r) => r.externalId).filter((x): x is string => x !== null))
}

export function importProjectConversations(
  db: Db,
  project: { id: string; rootPath: string },
  opts: ImportOptions = {}
): DualImportSummary {
  const limit = opts.limit ?? 200
  const zhome = opts.zcodeHome ?? join(homedir(), '.zcode')
  const chome = opts.codexHome ?? join(homedir(), '.codex')
  const root = normalize(project.rootPath)

  // ---- ZCode: exact-cwd sessions from its own DB ------------------------
  const zDbPath = join(zhome, 'cli', 'db', 'db.sqlite')
  const zAll = listZcodeSessions(zDbPath).filter((s) => normalize(s.cwd) === root)
  const zSkip = opts.force ? new Set<string>() : alreadyImported(db, project.id, 'zcode')
  const zConvs = zAll
    .filter((s) => !zSkip.has(s.externalId))
    .slice(0, limit)
    .map((s) => loadZcodeSession(zDbPath, s.externalId))
  const zSummary = importMany(db, project.id, 'zcode', zConvs)

  // ---- Codex: rollouts under the project root (cache-accelerated) -------
  let cache: ScanCache | undefined
  if (opts.scanCachePath) {
    cache = loadScanCacheFile(opts.scanCachePath)
  }
  const cAll = listCodexThreads(join(chome, 'sessions'), undefined, cache)
  if (opts.scanCachePath && cache) {
    // prune entries for files that no longer exist, then persist
    for (const p of Object.keys(cache)) {
      if (!cAll.some((t) => t.sourcePath === p)) delete cache[p]
    }
    saveScanCacheFile(opts.scanCachePath, cache)
  }
  const cMatched = cAll.filter((t) => {
    const c = normalize(t.cwd)
    return c === root || c.startsWith(`${root}/`)
  })
  const cSkip = opts.force ? new Set<string>() : alreadyImported(db, project.id, 'codex')
  const cConvs = cMatched
    .filter((t) => !cSkip.has(t.externalId))
    .slice(0, limit)
    .map((t) => loadCodexThread(t.sourcePath))
  const cSummary = importMany(db, project.id, 'codex', cConvs)

  return {
    zcode: zSummary,
    codex: cSummary,
    found: { zcode: zAll.length, codex: cMatched.length }
  }
}
