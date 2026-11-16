import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Workspace packages ship TypeScript sources; bundle them into the app
// instead of externalizing (external resolution would fail at runtime).
const WORKSPACE_PACKAGES = [
  '@cross-agent-sync/adapter-codex',
  '@cross-agent-sync/adapter-common',
  '@cross-agent-sync/adapter-zcode',
  '@cross-agent-sync/core',
  '@cross-agent-sync/database',
  '@cross-agent-sync/shared'
]

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: WORKSPACE_PACKAGES })]
  },
  preload: {
    plugins: [externalizeDepsPlugin({ exclude: WORKSPACE_PACKAGES })]
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
