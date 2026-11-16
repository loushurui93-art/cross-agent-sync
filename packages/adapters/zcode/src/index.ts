/**
 * ZCode adapter.
 *
 * Verified facts (desktop 3.18.x, zcode-guide/diagnosing-mcp + real-machine
 * testing 2026-11-16):
 * - Workspace config (`<repo>/.zcode/config.json`) is NOT reliably loaded by
 *   the desktop app even when the session cwd is the project dir — so we
 *   write the USER-level config `~/.zcode/cli/config.json` instead, which
 *   is always read and auto-connects.
 * - Per-project server names (`cross-agent-sync-<pid8>`) keep multiple
 *   bound projects from shadowing each other.
 * - Strict schema: unknown keys drop the whole server entry; stdio takes
 *   `command` (string) + `args[]` + `env`; no `${...}` expansion →
 *   absolute paths only.
 */

import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import {
  AGENTS_MD_MARKER,
  agentsMdContent,
  applyWrite,
  LEGACY_SERVER_NAME,
  planWrite,
  serverNameFor,
  type AgentAdapter,
  type GeneratedFile,
  type McpConfigStatus,
  type McpServerConfig,
  type WritePlan
} from '@cross-agent-sync/adapter-common'

export { serverNameFor }

export interface ZcodePaths {
  /** ZCode home, defaults to ~/.zcode (tests inject a temp dir). */
  home?: string
}

function safeParseJson(text: string): Record<string, unknown> | null {
  try {
    const v = JSON.parse(text)
    return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : null
  } catch {
    return null
  }
}

function userConfigPath(home: string): string {
  return join(home, 'cli', 'config.json')
}

function readServerEntry(configPath: string, name: string): unknown {
  if (!existsSync(configPath)) return undefined
  const parsed = safeParseJson(readFileSync(configPath, 'utf8'))
  const servers = (parsed?.mcp as Record<string, unknown> | undefined)?.servers as
    | Record<string, unknown>
    | undefined
  return servers?.[name]
}

export function createZcodeAdapter(paths: ZcodePaths = {}): AgentAdapter {
  const home = paths.home ?? join(homedir(), '.zcode')

  return {
    id: 'zcode',
    displayName: 'ZCode',

    detectInstallation(): boolean {
      return existsSync(home)
    },

    rulesFile(projectRoot: string): GeneratedFile {
      return {
        path: join(projectRoot, 'AGENTS.md'),
        content: agentsMdContent(projectRoot.split(/[\\/]/).pop() || 'project'),
        description: 'Shared agent rules (ZCode reads AGENTS.md natively)'
      }
    },

    mcpConfigStatus(_projectRoot: string, projectId?: string): McpConfigStatus {
      const p = userConfigPath(home)
      const name = projectId ? serverNameFor(projectId) : LEGACY_SERVER_NAME
      return {
        configured: readServerEntry(p, name) !== undefined,
        path: p,
        shadowed: false,
        // a legacy fixed-name entry would collide with every project
        shadowedBy: readServerEntry(p, LEGACY_SERVER_NAME) !== undefined ? p : undefined
      }
    },

    planMcpConfig(_projectRoot: string, cfg: McpServerConfig): WritePlan {
      const abs = userConfigPath(home)
      const current = existsSync(abs) ? readFileSync(abs, 'utf8') : null
      const parsed = current !== null ? safeParseJson(current) : null
      if (current !== null && parsed === null) {
        // Guide §9.3: parse failure → refuse to touch the file.
        throw new Error(
          `${abs} is not valid JSON; fix or remove it manually before configuring MCP`
        )
      }

      const root = parsed ?? {}
      const mcp = (root.mcp as Record<string, unknown> | undefined) ?? {}
      const servers = { ...((mcp.servers as Record<string, unknown> | undefined) ?? {}) }
      servers[serverNameFor(cfg.projectId)] = {
        type: 'stdio',
        command: cfg.nodePath ?? process.execPath,
        args: [cfg.serverEntry],
        env: {
          ...(cfg.extraEnv ?? {}),
          CAS_DB_PATH: cfg.dbPath,
          CAS_PROJECT_ID: cfg.projectId,
          CAS_AGENT_ID: cfg.agentId
        }
      }
      // drop the pre-per-project-name entry if present (same managed namespace)
      delete servers[LEGACY_SERVER_NAME]

      const next = { ...root, mcp: { ...mcp, servers } }
      return planWrite({
        path: abs,
        content: `${JSON.stringify(next, null, 2)}\n`,
        description: 'ZCode user-level MCP config (~/.zcode/cli/config.json)'
      })
    },

    removeMcpConfig(_projectRoot: string, projectId: string): void {
      const abs = userConfigPath(home)
      if (!existsSync(abs)) return
      const parsed = safeParseJson(readFileSync(abs, 'utf8'))
      if (!parsed) return
      const mcp = parsed.mcp as Record<string, unknown> | undefined
      const servers = mcp?.servers as Record<string, unknown> | undefined
      if (!servers) return
      const name = serverNameFor(projectId)
      if (!(name in servers) && !(LEGACY_SERVER_NAME in servers)) return
      delete servers[name]
      delete servers[LEGACY_SERVER_NAME]
      const plan = planWrite({
        path: abs,
        content: `${JSON.stringify({ ...parsed, mcp: { ...mcp, servers } }, null, 2)}\n`,
        description: 'remove cross-agent-sync entries'
      })
      applyWrite(plan)
    }
  }
}

export { AGENTS_MD_MARKER }
