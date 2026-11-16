/**
 * Codex adapter.
 *
 * Verified facts (cli 0.159.x on this machine, `codex mcp list` checked):
 * - MCP servers live in `~/.codex/config.toml` under `[mcp_servers.<name>]`
 *   with `command`, `args`, `env` (inline table form works).
 * - Per-project section names (`cross-agent-sync-<pid8>`) let several bound
 *   projects coexist in the one global file.
 * - We surgically replace only our own section and never re-serialize the
 *   rest of the TOML (preserves comments/other servers).
 * - Reads `AGENTS.md` at the project root.
 */

import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import {
  agentsMdContent,
  applyWrite,
  planWrite,
  serverNameFor,
  type AgentAdapter,
  type GeneratedFile,
  type McpConfigStatus,
  type McpServerConfig,
  type WritePlan
} from '@cross-agent-sync/adapter-common'

export { serverNameFor }
const LEGACY = 'cross-agent-sync'

export interface CodexPaths {
  /** Codex home, defaults to ~/.codex (tests inject a temp dir). */
  home?: string
}

function sectionNameFor(projectId: string): string {
  return `mcp_servers.${serverNameFor(projectId)}`
}

function serverSection(cfg: McpServerConfig): string {
  const envEntries = [
    ...Object.entries(cfg.extraEnv ?? {}).map(([k, v]) => `${k} = ${tomlString(v)}`),
    `CAS_DB_PATH = ${tomlString(cfg.dbPath)}`,
    `CAS_PROJECT_ID = ${tomlString(cfg.projectId)}`,
    `CAS_AGENT_ID = ${tomlString(cfg.agentId)}`
  ]
  return [
    `[${sectionNameFor(cfg.projectId)}]`,
    '# managed by cross-agent-sync',
    `command = ${tomlString(cfg.nodePath ?? process.execPath)}`,
    `args = [${tomlString(cfg.serverEntry)}]`,
    `env = { ${envEntries.join(', ')} }`
  ].join('\n')
}

function tomlString(s: string): string {
  return JSON.stringify(s) // JSON string escaping is valid TOML basic-string escaping
}

function sectionBody(toml: string, section: string): string | null {
  const lines = toml.split('\n')
  const start = lines.findIndex((l) => l.trim() === `[${section}]`)
  if (start === -1) return null
  let end = start + 1
  while (end < lines.length && !/^\s*\[/.test(lines[end])) end++
  return lines.slice(start, end).join('\n')
}

/** Replace only our section, keep everything else byte-for-byte. */
export function replaceOrAppendSection(toml: string, section: string, body: string): string {
  const lines = toml.split('\n')
  const start = lines.findIndex((l) => l.trim() === `[${section}]`)
  if (start === -1) {
    const prefix = toml.endsWith('\n') || toml === '' ? '' : '\n'
    return `${toml}${prefix}${body}\n`
  }
  let end = start + 1
  while (end < lines.length && !/^\s*\[/.test(lines[end])) end++
  return [...lines.slice(0, start), ...body.split('\n'), ...lines.slice(end)].join('\n')
}

/** Remove a section (and its trailing blank lines) entirely. */
export function removeSection(toml: string, section: string): string {
  const lines = toml.split('\n')
  const start = lines.findIndex((l) => l.trim() === `[${section}]`)
  if (start === -1) return toml
  let end = start + 1
  while (end < lines.length && !/^\s*\[/.test(lines[end])) end++
  while (end < lines.length && lines[end].trim() === '') end++
  const out = [...lines.slice(0, start), ...lines.slice(end)]
  // avoid leading blank pile-up at EOF
  while (out.length > 0 && out[out.length - 1].trim() === '') out.pop()
  return `${out.join('\n')}\n`
}

export function hasSection(toml: string, section: string): boolean {
  return sectionBody(toml, section) !== null
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

    mcpConfigStatus(_projectRoot: string, projectId?: string): McpConfigStatus {
      const p = configPath()
      const toml = existsSync(p) ? readFileSync(p, 'utf8') : ''
      const section = projectId ? sectionNameFor(projectId) : `mcp_servers.${LEGACY}`
      return {
        configured: hasSection(toml, section),
        path: p,
        shadowed: hasSection(toml, `mcp_servers.${LEGACY}`),
        shadowedBy: hasSection(toml, `mcp_servers.${LEGACY}`) ? p : undefined
      }
    },

    planMcpConfig(_projectRoot: string, cfg: McpServerConfig): WritePlan {
      const p = configPath()
      let current = existsSync(p) ? readFileSync(p, 'utf8') : null
      // drop the legacy fixed-name section on the way through
      if (current !== null && hasSection(current, `mcp_servers.${LEGACY}`)) {
        current = removeSection(current, `mcp_servers.${LEGACY}`)
      }
      const next = replaceOrAppendSection(
        current ?? '',
        sectionNameFor(cfg.projectId),
        serverSection(cfg)
      )
      return planWrite({
        path: p,
        content: next,
        description: 'Codex MCP config (~/.codex/config.toml)'
      })
    },

    removeMcpConfig(_projectRoot: string, projectId: string): void {
      const p = configPath()
      if (!existsSync(p)) return
      const toml = readFileSync(p, 'utf8')
      const next = removeSection(
        removeSection(toml, sectionNameFor(projectId)),
        `mcp_servers.${LEGACY}`
      )
      if (next === toml) return
      applyWrite(
        planWrite({ path: p, content: next, description: 'remove cross-agent-sync section' })
      )
    }
  }
}
