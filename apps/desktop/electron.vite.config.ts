import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Workspace packages ship TypeScript sources; bundle them into the app
// instead of externalizing (external resolution would fail at runtime).
const WORKSPACE_PACKAGES = [
  '@cross-agent-sync/adapter-claude-code',
  '@cross-agent-sync/adapter-codex',
  '@cross-agent-sync/adapter-common',
  '@cross-agent-sync/adapter-zcode',
  '@cross-agent-sync/conversation',
  '@cross-agent-sync/core',
  '@cross-agent-sync/database',
  '@cross-agent-sync/file-monitor',
  '@cross-agent-sync/git-service',
  '@cross-agent-sync/shared'
]

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: WORKSPACE_PACKAGES })]
  },
  preload: {
    // sandboxed preloads cannot require external packages at runtime —
    // bundle everything the preload imports
    plugins: [
      externalizeDepsPlugin({ exclude: [...WORKSPACE_PACKAGES, '@electron-toolkit/preload'] })
    ]
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src')
      }
    },
    plugins: [react(), tailwindcss()]
  }
})
