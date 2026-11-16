import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Workspace packages ship TypeScript sources; bundle them into the app
// instead of externalizing (external resolution would fail at runtime).
const WORKSPACE = /^@cross-agent-sync\//

export default defineConfig({
  main: {
    plugins: [
      externalizeDepsPlugin({
        exclude: [
          '@cross-agent-sync/core',
          '@cross-agent-sync/database',
          '@cross-agent-sync/shared'
        ]
      })
    ]
  },
  preload: {
    plugins: [externalizeDepsPlugin({ exclude: ['@cross-agent-sync/shared'] })]
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

// keep the regex import surface explicit for future packages
export const workspacePattern = WORKSPACE
