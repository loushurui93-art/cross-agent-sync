/**
 * Project file monitoring (guide §12.1): chokidar over an authorized root,
 * ignore rules (build dirs, caches, secrets), per-path debounce so editor
 * save-storms collapse into single events. Watcher events carry NO agent
 * attribution — attribution only happens when an agent calls
 * `report_file_change` over MCP.
 */

import chokidar, { type FSWatcher } from 'chokidar'
import { basename, join, relative, sep } from 'node:path'

export interface FileEvent {
  eventType: 'add' | 'change' | 'unlink'
  relativePath: string
}

export type FileEventCallback = (events: FileEvent[]) => void

/** Guide §12.1 defaults + §15.3 sensitive files. */
export const DEFAULT_IGNORES = [
  '**/.git/**',
  '**/node_modules/**',
  '**/dist/**',
  '**/build/**',
  '**/out/**',
  '**/.cache/**',
  '**/.tmp/**',
  '**/coverage/**',
  '**/.agent-sync/**', // our own writes; context versions already tracked
  '**/.zcode/**',
  '**/.env',
  '**/.env.*',
  '**/*.pem',
  '**/*.key',
  '**/id_rsa*',
  '**/id_ed25519*',
  '**/credentials.json',
  '**/secrets/**'
]

export function isIgnored(relPath: string, ignores: string[] = DEFAULT_IGNORES): boolean {
  const parts = relPath.split(/[\\/]/)
  const base = basename(relPath)
  for (const raw of ignores) {
    const rule = raw.replace(/^\*\*\//, '') // '**/.env' -> '.env'
    if (rule.endsWith('/**')) {
      // directory rule: '**/node_modules/**' -> 'node_modules'
      const dir = rule.slice(0, -3)
      if (parts.includes(dir)) return true
    } else if (rule.startsWith('*.')) {
      if (base.endsWith(rule.slice(1))) return true
    } else if (rule.endsWith('*')) {
      if (base.startsWith(rule.slice(0, -1))) return true
    } else if (base === rule || relPath === raw || relPath === rule) {
      return true
    }
  }
  return false
}

export interface MonitorOptions {
  root: string
  /** debounce window (ms) */
  debounceMs?: number
  ignores?: string[]
  onEvents: FileEventCallback
}

export interface Monitor {
  stop(): Promise<void>
}

export function createMonitor(opts: MonitorOptions): Monitor {
  const debounceMs = opts.debounceMs ?? 500
  const pending = new Map<string, FileEvent>()
  let timer: NodeJS.Timeout | null = null
  let stopped = false

  const flush = (): void => {
    timer = null
    if (stopped || pending.size === 0) return
    const events = [...pending.values()]
    pending.clear()
    opts.onEvents(events)
  }

  const record = (eventType: FileEvent['eventType'], absPath: string): void => {
    const relPath = relative(opts.root, absPath).split(sep).join('/')
    if (!relPath || relPath.startsWith('..')) return
    if (isIgnored(relPath, opts.ignores)) return
    // unlink wins over add/change for the same path within the window
    pending.set(relPath, { eventType, relativePath: relPath })
    if (timer) clearTimeout(timer)
    timer = setTimeout(flush, debounceMs)
  }

  const watcher: FSWatcher = chokidar.watch(opts.root, {
    ignored: (abs) => {
      const rel = relative(opts.root, abs)
      return rel !== '' && isIgnored(rel.split(sep).join('/'), opts.ignores)
    },
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 50 }
  })
  watcher.on('add', (p) => record('add', p as string))
  watcher.on('change', (p) => record('change', p as string))
  watcher.on('unlink', (p) => record('unlink', p as string))

  return {
    stop: async () => {
      stopped = true
      if (timer) clearTimeout(timer)
      await watcher.close()
    }
  }
}

export { join }
