import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type { IpcResult } from '@cross-agent-sync/shared'

/**
 * The only bridge into the main process (guide §15.1): a small, typed API
 * surface. The renderer never touches ipcRenderer, Node or the filesystem
 * directly.
 */
const api = {
  projects: {
    list: (): Promise<IpcResult<unknown>> => ipcRenderer.invoke('projects:list'),
    create: (input: { name: string; rootPath: string; description?: string }) =>
      ipcRenderer.invoke('projects:create', input) as Promise<IpcResult<unknown>>,
    remove: (projectId: string) =>
      ipcRenderer.invoke('projects:remove', { projectId }) as Promise<IpcResult<unknown>>
  },
  context: {
    get: (projectId: string, type: string) =>
      ipcRenderer.invoke('context:get', { projectId, type }) as Promise<IpcResult<unknown>>,
    save: (input: {
      projectId: string
      type: string
      content: string
      expectedVersion?: number
    }) => ipcRenderer.invoke('context:save', input) as Promise<IpcResult<unknown>>,
    external: (projectId: string, type: string) =>
      ipcRenderer.invoke('context:external', { projectId, type }) as Promise<
        IpcResult<boolean>
      >,
    resync: (projectId: string, type: string) =>
      ipcRenderer.invoke('context:resync', { projectId, type }) as Promise<IpcResult<unknown>>
  },
  tasks: {
    list: (projectId: string) =>
      ipcRenderer.invoke('tasks:list', { projectId }) as Promise<IpcResult<unknown>>,
    create: (input: { projectId: string; title: string; description?: string }) =>
      ipcRenderer.invoke('tasks:create', input) as Promise<IpcResult<unknown>>,
    update: (input: {
      projectId: string
      taskId: string
      status?: string
      expectedVersion?: number
    }) => ipcRenderer.invoke('tasks:update', input) as Promise<IpcResult<unknown>>
  },
  dialog: {
    pickDirectory: (): Promise<IpcResult<string | null>> =>
      ipcRenderer.invoke('dialog:pickDirectory')
  }
}

export type Api = typeof api

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
