/**
 * Backup / restore (guide §15.5): `VACUUM INTO` snapshots into
 * userData/backups; restore swaps the database file and reopens services
 * (a pre-restore snapshot is taken automatically).
 */

import { copyFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { app, ipcMain } from 'electron'
import { createDatabase, type Db } from '@cross-agent-sync/database'
import { appError } from '@cross-agent-sync/shared'
import { z } from 'zod'
import { closeServices, db, setHandle } from './services'
import { restartMonitors } from './files'

const dbPath = (): string => join(app.getPath('userData'), 'cross-agent-sync.db')
const backupsDir = (): string => join(app.getPath('userData'), 'backups')

export function backupNow(): { file: string } {
  const dir = backupsDir()
  mkdirSync(dir, { recursive: true })
  const file = join(dir, `cross-agent-sync-${new Date().toISOString().replace(/[:.]/g, '-')}.db`)
  db().exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`)
  return { file }
}

export function listBackups(): Array<{ name: string; file: string }> {
  const dir = backupsDir()
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((f) => f.startsWith('cross-agent-sync-') && f.endsWith('.db'))
    .sort()
    .reverse()
    .map((name) => ({ name, file: join(dir, name) }))
}

export function restoreBackup(name: string): { restoredFrom: string } {
  const src = join(backupsDir(), name)
  if (!existsSync(src)) throw appError('INVALID_INPUT', `no backup ${name}`)
  const target = dbPath()
  if (existsSync(target)) {
    // safety snapshot of the current db before overwriting it
    copyFileSync(target, join(backupsDir(), `pre-restore-${Date.now()}.db`))
  }
  closeServices()
  copyFileSync(src, target)
  setHandle(createDatabase(target))
  void restartMonitors((): Db => db())
  return { restoredFrom: name }
}

const RestoreSchema = z.object({ name: z.string().min(1).max(200) })

export function registerDataIpc(): void {
  ipcMain.handle('data:backup', () => {
    try {
      return { ok: true, data: backupNow() }
    } catch (e) {
      return { ok: false, error: { code: 'INTERNAL', message: String(e) } }
    }
  })
  ipcMain.handle('data:listBackups', () => {
    try {
      return { ok: true, data: listBackups() }
    } catch (e) {
      return { ok: false, error: { code: 'INTERNAL', message: String(e) } }
    }
  })
  ipcMain.handle('data:restore', (_e, raw: { name?: string }) => {
    try {
      const { name } = RestoreSchema.parse({ name: raw?.name })
      return { ok: true, data: restoreBackup(name) }
    } catch (e) {
      return {
        ok: false,
        error: {
          code: e instanceof Error && e.name === 'ZodError' ? 'INVALID_INPUT' : 'INTERNAL',
          message: String(e instanceof Error ? e.message : e)
        }
      }
    }
  })
}
