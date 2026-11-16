/**
 * File monitoring lifecycle + Git read status.
 *
 * Watchers are (re)started for every managed project; events carry NO agent
 * attribution (guide §12.2) and land in file_events with actor=system.
 */

import type { Db } from '@cross-agent-sync/database'
import { createMonitor, type Monitor } from '@cross-agent-sync/file-monitor'
import { repoStatus } from '@cross-agent-sync/git-service'
import * as core from '@cross-agent-sync/core'

const monitors = new Map<string, Monitor>()

export async function restartMonitors(getDb: () => Db): Promise<void> {
  await stopMonitors()
  const db = getDb()
  for (const p of core.listProjects(db)) {
    try {
      const monitor = createMonitor({
        root: p.rootPath,
        onEvents: (events) => {
          for (const e of events) {
            try {
              core.reportFileChange(getDb(), {
                projectId: p.id,
                relativePath: e.relativePath,
                eventType: e.eventType,
                actor: { type: 'system' }
              })
            } catch (err) {
              console.warn('[file-monitor] record failed:', err)
            }
          }
        }
      })
      monitors.set(p.id, monitor)
    } catch (err) {
      console.warn(`[file-monitor] cannot watch ${p.rootPath}:`, err)
    }
  }
}

export async function stopMonitors(): Promise<void> {
  await Promise.all([...monitors.values()].map((m) => m.stop()))
  monitors.clear()
}

export function fileEvents(db: Db, projectId: string): unknown {
  return core.listFileEvents(db, projectId, 100)
}

export async function gitStatus(rootPath: string): Promise<unknown> {
  return repoStatus(rootPath)
}
