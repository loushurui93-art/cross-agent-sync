/**
 * Agent onboarding IPC: adapters for ZCode + Codex, preview/apply with
 * content-hash confirmation (the UI previews a plan; apply re-plans and
 * refuses when the file changed in between).
 */

import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { app } from 'electron'
import { join } from 'node:path'
import {
  applyWrite,
  planWrite,
  type AgentAdapter,
  type WritePlan
} from '@cross-agent-sync/adapter-common'
import { createZcodeAdapter } from '@cross-agent-sync/adapter-zcode'
import { createCodexAdapter } from '@cross-agent-sync/adapter-codex'
import * as core from '@cross-agent-sync/core'
import { appError, type AgentKind } from '@cross-agent-sync/shared'
import { db } from './services'

export const adapters: Record<AgentKind, AgentAdapter> = {
  zcode: createZcodeAdapter(),
  codex: createCodexAdapter()
}

/** Absolute entry of the bundled MCP server. */
export function serverEntry(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, 'mcp-server', 'start.js')
  }
  const root = join(app.getAppPath(), '..', '..')
  return join(root, 'packages', 'mcp-server', 'dist', 'start.js')
}

/** Build the MCP server launch config for a project (used by onboarding + doctor). */
export function mcpConfigFor(
  projectId: string,
  agentId: AgentKind
): Parameters<AgentAdapter['planMcpConfig']>[1] {
  return {
    dbPath: join(app.getPath('userData'), 'cross-agent-sync.db'),
    projectId,
    agentId,
    serverEntry: serverEntry(),
    // process.execPath is electron.exe in dev AND packaged — always run the
    // MCP server in plain-Node mode, never as a full Electron app
    nodePath: process.execPath,
    extraEnv: { ELECTRON_RUN_AS_NODE: '1' }
  }
}

export function agentsStatus(projectId: string): unknown {
  const p = core.getProject(db(), projectId)
  return {
    project: { id: p.id, name: p.name, rootPath: p.rootPath },
    agents: (Object.keys(adapters) as AgentKind[]).map((id) => {
      const a = adapters[id]
      const rulesPath = a.rulesFile(p.rootPath).path
      return {
        id,
        displayName: a.displayName,
        installed: a.detectInstallation(),
        rulesPath,
        rulesWritten: existsSync(rulesPath),
        mcp: a.mcpConfigStatus(p.rootPath, projectId)
      }
    })
  }
}

/** Remove this project's MCP entries from every agent config (guarded). */
export function cleanupMcpConfigs(projectId: string): void {
  for (const a of Object.values(adapters)) {
    try {
      a.removeMcpConfig('', projectId)
    } catch (e) {
      console.warn(`[agents] mcp cleanup failed for ${a.id}:`, e)
    }
  }
}

/** ZCode and Codex read the same root AGENTS.md — one plan serves both. */
export function planRules(projectId: string): WritePlan {
  const p = core.getProject(db(), projectId)
  return planWrite(adapters.zcode.rulesFile(p.rootPath))
}

export function applyRules(projectId: string, expectedHash: string): unknown {
  const plan = planRules(projectId)
  if (hash(plan.next) !== expectedHash) {
    throw appError('INVALID_INPUT', 'file changed since preview; review the new diff')
  }
  const res = applyWrite(plan)
  core.logAudit(db(), {
    projectId,
    actorType: 'user',
    action: 'agent.rulesWritten',
    targetType: 'file',
    targetId: plan.target,
    details: { backup: res.backupPath }
  })
  return res
}

export function planMcp(projectId: string, agentId: AgentKind): WritePlan {
  const p = core.getProject(db(), projectId)
  return adapters[agentId].planMcpConfig(p.rootPath, mcpConfigFor(projectId, agentId))
}

export function applyMcp(projectId: string, agentId: AgentKind, expectedHash: string): unknown {
  const plan = planMcp(projectId, agentId)
  if (hash(plan.next) !== expectedHash) {
    throw appError('INVALID_INPUT', 'config changed since preview; review the new diff')
  }
  const res = applyWrite(plan)
  core.logAudit(db(), {
    projectId,
    actorType: 'user',
    action: 'agent.mcpConfigured',
    targetType: 'file',
    targetId: plan.target,
    details: { agent: agentId, backup: res.backupPath }
  })
  return res
}

function hash(s: string): string {
  return createHash('sha256').update(s).digest('hex')
}
