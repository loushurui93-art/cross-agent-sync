import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type { IpcResult } from '@cross-agent-sync/shared'

/**
 * The only bridge into the main process (guide §15.1): a small, typed API
 * surface. The renderer never touches ipcRenderer, Node or the filesystem
 * directly.
 */
const api = {
  appInfo: {
    /** true when running under the E2E harness (skips onboarding, etc.) */
    isE2E: !!process.env.CAS_E2E_DIR
  },
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
    save: (input: { projectId: string; type: string; content: string; expectedVersion?: number }) =>
      ipcRenderer.invoke('context:save', input) as Promise<IpcResult<unknown>>,
    external: (projectId: string, type: string) =>
      ipcRenderer.invoke('context:external', { projectId, type }) as Promise<IpcResult<boolean>>,
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
  },
  agents: {
    status: (projectId: string) =>
      ipcRenderer.invoke('agents:status', { projectId }) as Promise<IpcResult<unknown>>,
    planRules: (projectId: string) =>
      ipcRenderer.invoke('agents:planRules', { projectId }) as Promise<IpcResult<unknown>>,
    applyRules: (projectId: string, expectedHash: string) =>
      ipcRenderer.invoke('agents:applyRules', { projectId, expectedHash }) as Promise<
        IpcResult<unknown>
      >,
    planMcp: (projectId: string, agentId: string) =>
      ipcRenderer.invoke('agents:planMcp', { projectId, agentId }) as Promise<IpcResult<unknown>>,
    applyMcp: (projectId: string, agentId: string, expectedHash: string) =>
      ipcRenderer.invoke('agents:applyMcp', { projectId, agentId, expectedHash }) as Promise<
        IpcResult<unknown>
      >
  },
  conv: {
    import: (projectId: string) =>
      ipcRenderer.invoke('conv:import', { projectId, force: true }) as Promise<IpcResult<unknown>>,
    list: (projectId: string) =>
      ipcRenderer.invoke('conv:list', { projectId }) as Promise<IpcResult<unknown>>,
    messages: (conversationId: string) =>
      ipcRenderer.invoke('conv:messages', { conversationId }) as Promise<IpcResult<unknown>>,
    search: (q: { query: string; projectId?: string; limit?: number }) =>
      ipcRenderer.invoke('conv:search', q) as Promise<IpcResult<unknown>>
  },
  files: {
    events: (projectId: string) =>
      ipcRenderer.invoke('files:events', { projectId }) as Promise<IpcResult<unknown>>,
    git: (rootPath: string) =>
      ipcRenderer.invoke('files:git', { rootPath }) as Promise<IpcResult<unknown>>
  },
  data: {
    backup: () => ipcRenderer.invoke('data:backup') as Promise<IpcResult<unknown>>,
    listBackups: () => ipcRenderer.invoke('data:listBackups') as Promise<IpcResult<unknown>>,
    restore: (name: string) =>
      ipcRenderer.invoke('data:restore', { name }) as Promise<IpcResult<unknown>>
  },
  handoffs: {
    latest: (projectId: string) =>
      ipcRenderer.invoke('handoffs:latest', { projectId }) as Promise<IpcResult<unknown>>
  },
  doctor: {
    run: () => ipcRenderer.invoke('doctor:run') as Promise<IpcResult<unknown>>
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
