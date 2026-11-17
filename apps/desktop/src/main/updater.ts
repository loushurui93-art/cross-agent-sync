/**
 * In-app updates via electron-updater against GitHub Releases. Packaged
 * builds only — `pnpm dev` never checks. electron-builder emits the
 * latest.yml + blockmap alongside the installer on tagged CI builds.
 *
 * All handlers return the standard IpcResult envelope (bug fix: returning
 * the raw state crashed the renderer's envelope unwrapping).
 */

import { app, ipcMain, shell } from 'electron'

export type UpdateState =
  | { phase: 'idle' }
  | { phase: 'checking' }
  | { phase: 'up-to-date'; version: string }
  | { phase: 'available'; version: string; releaseUrl: string | null }
  | { phase: 'error'; message: string }

let lastState: UpdateState = { phase: 'idle' }

function setState(s: UpdateState): void {
  lastState = s
}

export function releaseUrlFor(version: string): string {
  return `https://github.com/loushurui93-art/cross-agent-sync/releases/tag/v${version}`
}

/** Open the release page — beta users download manually (no silent install). */
export function openReleasePage(version: string): void {
  void shell.openExternal(releaseUrlFor(version))
}

/** Numeric-triple comparison; a prerelease (with '-') ranks below a full release. */
function isNewer(latest: string, current: string): boolean {
  const pa = latest.split(/[-+]/)[0].split('.').map(Number)
  const pb = current.split(/[-+]/)[0].split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (d !== 0) return d > 0
  }
  return latest.includes('-') && !current.includes('-')
}

function ok<T>(data: T): { ok: true; data: T } {
  return { ok: true, data }
}

function err(e: unknown): { ok: false; error: { code: string; message: string } } {
  return { ok: false, error: { code: 'UPDATE_ERROR', message: String(e) } }
}

export function registerUpdaterIpc(): void {
  ipcMain.on('app:version', (e) => {
    e.returnValue = app.getVersion()
  })

  ipcMain.handle('update:state', () => ok(lastState))

  ipcMain.handle('update:check', async () => {
    try {
      if (!app.isPackaged) {
        const s: UpdateState = {
          phase: 'error',
          message: '开发模式不检查更新（仅打包版启用）'
        }
        setState(s)
        return ok(s)
      }
      setState({ phase: 'checking' })
      const { autoUpdater } = await import('electron-updater')
      autoUpdater.autoDownload = false // beta: user opts in via the release page
      const result = (await autoUpdater.checkForUpdates()) as
        | { updateInfo?: { version?: string } }
        | null
      const latest = String(result?.updateInfo?.version ?? '')
      const current = app.getVersion()
      if (!latest || !isNewer(latest, current)) {
        const s: UpdateState = { phase: 'up-to-date', version: current }
        setState(s)
        return ok(s)
      }
      const s: UpdateState = {
        phase: 'available',
        version: latest,
        releaseUrl: releaseUrlFor(latest)
      }
      setState(s)
      return ok(s)
    } catch (e) {
      const s: UpdateState = { phase: 'error', message: String(e) }
      setState(s)
      return err(e)
    }
  })

  ipcMain.handle('update:openRelease', (_e, raw: { version?: string }) => {
    openReleasePage(String(raw?.version ?? app.getVersion()))
    return ok(true)
  })
}
