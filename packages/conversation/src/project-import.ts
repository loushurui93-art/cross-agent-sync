/**
 * Per-project import orchestration: scan both agents' local stores, pick
 * sessions whose working directory belongs to the project, import them.
 */

import type { Db } from '@cross-agent-sync/database'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { importMany, type ImportSummary } from './import'
import { listZcodeSessions, loadZcodeSession } from './sources/zcode'
import { listCodexThreads, loadCodexThread } from './sources/codex'

export interface DualImportSummary {
  zcode: ImportSummary
  codex: ImportSummary
  found: { zcode: number; codex: number }
}

export function importProjectConversations(
  db: Db,
  project: { id: string; rootPath: string },
  opts: { limit?: number; zcodeHome?: string; codexHome?: string } = {}
): DualImportSummary {
  const limit = opts.limit ?? 50
  const zhome = opts.zcodeHome ?? join(homedir(), '.zcode')
  const chome = opts.codexHome ?? join(homedir(), '.codex')
  const root = normalize(project.rootPath)

  // ZCode matches sessions by the exact cwd recorded in its DB.
  const zSessions = listZcodeSessions(join(zhome, 'cli', 'db', 'db.sqlite')).filter(
    (s) => normalize(s.cwd) === root
  )
  const zSummary = importMany(
    db,
    project.id,
    'zcode',
    zSessions
      .slice(0, limit)
      .map((s) => loadZcodeSession(join(zhome, 'cli', 'db', 'db.sqlite'), s.externalId))
  )

  // Codex sessions may live anywhere inside the project root.
  const cThreads = listCodexThreads(join(chome, 'sessions')).filter((t) => {
    const c = normalize(t.cwd)
    return c === root || c.startsWith(`${root}/`)
  })
  const cSummary = importMany(
    db,
    project.id,
    'codex',
    cThreads.slice(0, limit).map((t) => loadCodexThread(t.sourcePath))
  )

  return {
    zcode: zSummary,
    codex: cSummary,
    found: { zcode: zSessions.length, codex: cThreads.length }
  }
}

function normalize(p: string): string {
  return p
    .replace(/^\\\\\?\\/i, '') // Windows extended-length prefix (Codex cwds)
    .replace(/\\/g, '/')
    .replace(/\/+$/, '')
    .toLowerCase()
}
