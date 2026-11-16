/**
 * Codex adapter.
 *
 * Verified facts (cli 0.159.x on this machine):
 * - MCP servers live in `~/.codex/config.toml` under
 *   `[mcp_servers.<name>]` with `command`, `args`, `env`.
 * - The config file is user-global (not per project); we surgically
 *   replace only our own section and never re-serialize the rest of the
 *   TOML (preserves comments/other servers).
 * - Reads `AGENTS.md` at the project root.
 */

import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import {
  agentsMdContent,
  planWrite,
  type AgentAdapter,
  type GeneratedFile,
  type McpConfigStatus,
  type McpServerConfig,
  type WritePlan
} from '@cross-agent-sync/adapter-common'

export const SERVER_NAME = 'cross-agent-sync'
const SECTION = `[mcp_servers.${SERVER_NAME}]`

export interface CodexPaths {
  /** Codex home, defaults to ~/.codex (tests inject a temp dir). */
  home?: string
}

function serverSection(cfg: McpServerConfig): string {
  const envEntries = [
    ...Object.entries(cfg.extraEnv ?? {}).map(([k, v]) => `${k} = ${tomlString(v)}`),
    `CAS_DB_PATH = ${tomlString(cfg.dbPath)}`,
    `CAS_PROJECT_ID = ${tomlString(cfg.projectId)}`,
    `CAS_AGENT_ID = ${tomlString(cfg.agentId)}`
  ]
  return [
    SECTION,
    '# managed by cross-agent-sync',
    `command = ${tomlString(cfg.nodePath ?? process.execPath)}`,
    `args = [${tomlString(cfg.serverEntry)}]`,
    `env = { ${envEntries.join(', ')} }`
  ].join('\n')
}

function tomlString(s: string): string {
  return JSON.stringify(s) // JSON string escaping is valid TOML basic-string escaping
}

/** Replace only our section, keep everything else byte-for-byte. */
export function replaceOrAppendSection(toml: string, section: string): string {
  const lines = toml.split('\n')
  const start = lines.findIndex((l) => l.trim() === SECTION)
  if (start === -1) {
    const prefix = toml.endsWith('\n') || toml === '' ? '' : '\n'
    return `${toml}${prefix}${section}\n`
  }
  let end = start + 1
  while (end < lines.length && !/^\s*\[/.test(lines[end])) end++
  const next = [...lines.slice(0, start), ...section.split('\n'), ...lines.slice(end)]
  return next.join('\n')
}

export function hasSection(toml: string): boolean {
  return toml.split('\n').some((l) => l.trim() === SECTION)
}

export function createCodexAdapter(paths: CodexPaths = {}): AgentAdapter {
  const home = paths.home ?? join(homedir(), '.codex')
  const configPath = (): string => join(home, 'config.toml')

  return {
    id: 'codex',
    displayName: 'Codex',

    detectInstallation(): boolean {
      return existsSync(home)
    },

    rulesFile(projectRoot: string): GeneratedFile {
      return {
        path: join(projectRoot, 'AGENTS.md'),
        content: agentsMdContent(projectRoot.split(/[\\/]/).pop() || 'project'),
        description: 'Shared agent rules (Codex reads AGENTS.md natively)'
      }
    },

    mcpConfigStatus(_projectRoot: string): McpConfigStatus {
      const p = configPath()
      const toml = existsSync(p) ? readFileSync(p, 'utf8') : ''
      return { configured: hasSection(toml), path: p, shadowed: false }
    },

    planMcpConfig(_projectRoot: string, cfg: McpServerConfig): WritePlan {
      const p = configPath()
      const current = existsSync(p) ? readFileSync(p, 'utf8') : null
      const next = replaceOrAppendSection(current ?? '', serverSection(cfg))
      return planWrite({
        path: p,
        content: next,
        description: 'Codex MCP config (~/.codex/config.toml)'
      })
    }
  }
}
