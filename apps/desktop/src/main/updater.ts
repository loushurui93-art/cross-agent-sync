/**
 * In-app updates via electron-updater against GitHub Releases. Packaged
 * builds only — `pnpm dev` never checks. electron-builder emits the
 * latest.yml + blockmap alongside the installer on tagged CI builds.
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

export function registerUpdaterIpc(): void {
  ipcMain.on('app:version', (e) => {
    e.returnValue = app.getVersion()
  })
  ipcMain.handle('update:state', () => lastState)

  ipcMain.handle('update:check', async () => {
    if (!app.isPackaged) {
      setState({ phase: 'error', message: '开发模式不检查更新（仅打包版启用）' })
      return lastState
    }
    setState({ phase: 'checking' })
    try {
      const { autoUpdater } = await import('electron-updater')
      autoUpdater.autoDownload = false // beta: user opts in via the release page
      autoUpdater.on('update-not-available', () =>
        setState({ phase: 'up-to-date', version: app.getVersion() })
      )
      autoUpdater.on('update-available', (info) => {
        const version = String((info as { version?: string }).version ?? '')
        setState({ phase: 'available', version, releaseUrl: releaseUrlFor(version) })
      })
      autoUpdater.on('error', (e) => setState({ phase: 'error', message: String(e) }))
      await autoUpdater.checkForUpdates()
    } catch (e) {
      setState({ phase: 'error', message: String(e) })
    }
    return lastState
  })

  ipcMain.handle('update:openRelease', (_e, raw: { version?: string }) => {
    openReleasePage(String(raw?.version ?? app.getVersion()))
    return true
  })
}
