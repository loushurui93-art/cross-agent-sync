/**
 * Claude Code adapter.
 *
 * Verified facts (Claude Code on this machine, 2026-11):
 * - Project-scoped MCP config: `<project>/.mcp.json` → `{"mcpServers": {name:
 *   {command, args, env}}}`. Claude Code asks the user to approve project
 *   servers on first use (trust dialog) — expected behavior, surfaced in UI.
 * - Rules: `CLAUDE.md` at the project root supports `@path` imports, so we
 *   generate a thin CLAUDE.md importing the shared AGENTS.md (single source
 *   of truth across agents).
 * - Conversations: `~/.claude/projects/<encoded-path>/<uuid>.jsonl`
 *   (encoded = drive colon stripped, separators → '-'); JSONL lines with
 *   type user/assistant/... and `message.{role, content}` (string or block
 *   array); `cwd` on message lines; subagent lines carry isSidechain:true.
 */

import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import {
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

export interface ClaudePaths {
  /** Claude home, defaults to ~/.claude (tests inject a temp dir). */
  home?: string
}

const MCP_FILE = '.mcp.json'

function safeParseJson(text: string): Record<string, unknown> | null {
  try {
    const v = JSON.parse(text)
    return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : null
  } catch {
    return null
  }
}

function claudeMdContent(projectName: string): string {
  return [
    `# ${projectName} — shared agent rules`,
    '',
    '<!-- managed by cross-agent-sync -->',
    '',
    'This project keeps its shared context in Cross-Agent Sync.',
    'The canonical rules live in AGENTS.md and are imported below — edit them there.',
    '',
    '@AGENTS.md',
    ''
  ].join('\n')
}

export function createClaudeCodeAdapter(paths: ClaudePaths = {}): AgentAdapter {
  const home = paths.home ?? join(homedir(), '.claude')

  return {
    id: 'claude-code',
    displayName: 'Claude Code',

    detectInstallation(): boolean {
      return existsSync(home)
    },

    rulesFile(projectRoot: string): GeneratedFile {
      return {
        path: join(projectRoot, 'CLAUDE.md'),
        content: claudeMdContent(projectRoot.split(/[\\/]/).pop() || 'project'),
        description: 'Claude Code rules (imports the shared AGENTS.md via @AGENTS.md)'
      }
    },

    mcpConfigStatus(projectRoot: string, projectId?: string): McpConfigStatus {
      const p = join(projectRoot, MCP_FILE)
      const parsed = existsSync(p) ? safeParseJson(readFileSync(p, 'utf8')) : null
      const name = projectId ? serverNameFor(projectId) : 'cross-agent-sync'
      const servers = parsed?.mcpServers as Record<string, unknown> | undefined
      return {
        configured: servers ? name in servers : false,
        path: p,
        shadowed: false,
        detail: 'Claude Code 首次使用项目级 MCP 服务器时会弹出信任确认，选择允许即可'
      }
    },

    planMcpConfig(projectRoot: string, cfg: McpServerConfig): WritePlan {
      const abs = join(projectRoot, MCP_FILE)
      const current = existsSync(abs) ? readFileSync(abs, 'utf8') : null
      const parsed = current !== null ? safeParseJson(current) : null
      if (current !== null && parsed === null) {
        throw new Error(`${abs} is not valid JSON; fix it manually before configuring MCP`)
      }
      const root = parsed ?? {}
      const servers = { ...((root.mcpServers as Record<string, unknown> | undefined) ?? {}) }
      servers[serverNameFor(cfg.projectId)] = {
        command: cfg.nodePath ?? process.execPath,
        args: [cfg.serverEntry],
        env: {
          ...(cfg.extraEnv ?? {}),
          CAS_DB_PATH: cfg.dbPath,
          CAS_PROJECT_ID: cfg.projectId,
          CAS_AGENT_ID: cfg.agentId
        }
      }
      return planWrite({
        path: abs,
        content: `${JSON.stringify({ ...root, mcpServers: servers }, null, 2)}\n`,
        description: 'Claude Code project MCP config (.mcp.json)'
      })
    },

    removeMcpConfig(projectRoot: string, projectId: string): void {
      const abs = join(projectRoot, MCP_FILE)
      if (!existsSync(abs)) return
      const parsed = safeParseJson(readFileSync(abs, 'utf8'))
      if (!parsed) return
      const servers = parsed.mcpServers as Record<string, unknown> | undefined
      const name = serverNameFor(projectId)
      if (!servers || !(name in servers)) return
      delete servers[name]
      applyWrite(
        planWrite({
          path: abs,
          content: `${JSON.stringify({ ...parsed, mcpServers: servers }, null, 2)}\n`,
          description: 'remove cross-agent-sync entry'
        })
      )
    }
  }
}

export { claudeMdContent }
