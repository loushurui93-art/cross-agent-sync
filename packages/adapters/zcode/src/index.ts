/**
 * ZCode adapter.
 *
 * Verified facts (desktop 3.18.x, zcode-guide/diagnosing-mcp):
 * - Workspace MCP config: `<repo>/.zcode/config.json` → `mcp.servers`
 *   (nested key, NOT the flat `mcpServers` used by `.agents/mcp.json`).
 * - Strict schema: unknown keys make the whole server entry be dropped;
 *   stdio servers take `command` (string) + `args[]` + `env`.
 * - `${...}` templates are NOT expanded in config files → absolute paths.
 * - A same-named server in user-level `~/.zcode/cli/config.json` SHADOWS
 *   the workspace one (user overrides workspace) → must warn.
 * - Auto-connects every scope at session start.
 * - Reads `AGENTS.md` at the project root.
 */

import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import {
  AGENTS_MD_MARKER,
  agentsMdContent,
  planWrite,
  type AgentAdapter,
  type GeneratedFile,
  type McpConfigStatus,
  type McpServerConfig,
  type WritePlan
} from '@cross-agent-sync/adapter-common'

export const SERVER_NAME = 'cross-agent-sync'

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

    mcpConfigStatus(projectRoot: string): McpConfigStatus {
      const wsPath = join(projectRoot, '.zcode', 'config.json')
      const configured = readServerEntry(wsPath) !== undefined
      const shadowed = readServerEntry(join(home, 'cli', 'config.json')) !== undefined
      return {
        configured,
        path: wsPath,
        shadowed,
        shadowedBy: shadowed ? join(home, 'cli', 'config.json') : undefined
      }
    },

    planMcpConfig(projectRoot: string, cfg: McpServerConfig): WritePlan {
      const abs = join(projectRoot, '.zcode', 'config.json')
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
      const servers = (mcp.servers as Record<string, unknown> | undefined) ?? {}

      const next = {
        ...root,
        mcp: {
          ...mcp,
          servers: {
            ...servers,
            [SERVER_NAME]: {
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
          }
        }
      }

      return planWrite({
        path: abs,
        // absolute paths only (no ${...} expansion in ZCode config files)
        content: `${JSON.stringify(next, null, 2)}\n`,
        description: 'ZCode workspace MCP config (.zcode/config.json)'
      })
    }
  }
}

function readServerEntry(configPath: string): unknown {
  if (!existsSync(configPath)) return undefined
  const parsed = safeParseJson(readFileSync(configPath, 'utf8'))
  const servers = (parsed?.mcp as Record<string, unknown> | undefined)?.servers as
    | Record<string, unknown>
    | undefined
  return servers?.[SERVER_NAME]
}

export { AGENTS_MD_MARKER }
