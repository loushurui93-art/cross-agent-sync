/**
 * STDIO entry point. Spawned by each agent's MCP config, e.g.:
 *
 *   command: node
 *   args: [<repo>/packages/mcp-server/src/start.ts]  (via tsx in dev)
 *   env:   CAS_DB_PATH=<userData>/cross-agent-sync.db
 *          CAS_PROJECT_ID=<project uuid>
 *          CAS_AGENT_ID=zcode|codex
 *
 * Exits with a clear error when the environment is incomplete.
 */

import { existsSync } from 'node:fs'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { createDatabase } from '@cross-agent-sync/database'
import { buildServer } from './index'

async function main(): Promise<void> {
  const dbPath = process.env.CAS_DB_PATH
  const projectId = process.env.CAS_PROJECT_ID
  const agentId = process.env.CAS_AGENT_ID
  if (!dbPath || !projectId || !agentId) {
    console.error('cas-mcp: CAS_DB_PATH, CAS_PROJECT_ID and CAS_AGENT_ID are all required')
    process.exit(2)
  }
  if (!existsSync(dbPath)) {
    console.error(`cas-mcp: database not found at ${dbPath} — start the desktop app once first`)
    process.exit(2)
  }
  const db = createDatabase(dbPath)
  const server = buildServer({ db, projectId, agentId })
  await server.connect(new StdioServerTransport())
}

main().catch((e) => {
  console.error('cas-mcp failed:', e)
  process.exit(1)
})
