/**
 * Health self-check (doctor): environment, agent detection, per-project MCP
 * config presence, and a REAL MCP handshake (spawn the server exactly like
 * the agents do, initialize, list tools). Findings are grouped and rendered
 * on the Settings page.
 */

import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import { AGENT_KINDS, type AgentKind } from '@cross-agent-sync/shared'
import * as core from '@cross-agent-sync/core'
import { db } from './services'
import { adapters, mcpConfigFor } from './agents'
import { listBackups } from './data'

export interface Finding {
  group: string
  name: string
  status: 'ok' | 'warn' | 'fail'
  detail?: string
}

function spawnMcpCheck(
  projectId: string,
  agentId: AgentKind
): Promise<{ tools: number | null; error?: string }> {
  const cfg = mcpConfigFor(projectId, agentId)
  const child = spawn(cfg.nodePath ?? process.execPath, [cfg.serverEntry], {
    env: {
      ...(process.env as Record<string, string>),
      ...(cfg.extraEnv ?? {}),
      CAS_DB_PATH: cfg.dbPath,
      CAS_PROJECT_ID: cfg.projectId,
      CAS_AGENT_ID: cfg.agentId
    },
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true
  })
  return new Promise((resolve) => {
    let buf = ''
    let tools: number | null = null
    let settled = false
    const finish = (error?: string): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      try {
        child.kill()
      } catch {
        /* already gone */
      }
      resolve({ tools, error })
    }
    const timer = setTimeout(() => finish(`no response within 8s`), 8000)
    child.stdout.on('data', (d: Buffer) => {
      buf += d.toString('utf8')
      let idx: number
      while ((idx = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, idx).trim()
        buf = buf.slice(idx + 1)
        if (!line) continue
        try {
          const msg = JSON.parse(line) as { id?: number; result?: { tools?: unknown[] } }
          if (msg.id === 1) {
            // initialized accepted → ask for the tool list
            child.stdin.write(
              JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n'
            )
            child.stdin.write(
              JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }) + '\n'
            )
          } else if (msg.id === 2 && msg.result?.tools) {
            tools = msg.result.tools.length
            finish()
          }
        } catch {
          /* non-JSON line */
        }
      }
    })
    child.on('error', (e) => finish(e.message))
    child.stderr.on('data', (d: Buffer) => {
      const text = d.toString('utf8')
      if (!settled && /error|failed/i.test(text)) finish(text.slice(0, 300))
    })
    // kick off the handshake
    child.stdin.write(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'cross-agent-sync-doctor', version: '0.1.0' }
        }
      }) + '\n'
    )
  })
}

export async function runDoctor(): Promise<Finding[]> {
  const findings: Finding[] = []
  const projects = core.listProjects(db())

  // app / data -----------------------------------------------------------
  const dbFile = join(app.getPath('userData'), 'cross-agent-sync.db')
  findings.push({
    group: '应用',
    name: `v${app.getVersion()} · 数据目录`,
    status: existsSync(dbFile) ? 'ok' : 'fail',
    detail: app.getPath('userData')
  })
  const backups = listBackups()
  findings.push({
    group: '应用',
    name: '备份',
    status: backups.length > 0 ? 'ok' : 'warn',
    detail: backups.length > 0 ? `${backups.length} 份快照` : '尚无备份，建议在设置页创建一份'
  })

  // projects -------------------------------------------------------------
  findings.push({
    group: '项目',
    name: '已管理项目',
    status: projects.length > 0 ? 'ok' : 'warn',
    detail:
      projects.length === 0
        ? '还没有项目——先在项目页导入一个目录'
        : projects.map((p) => p.name).join('、')
  })

  // agents ---------------------------------------------------------------
  for (const kind of AGENT_KINDS) {
    const a = adapters[kind]
    const installed = a.detectInstallation()
    findings.push({
      group: 'Agent',
      name: `${a.displayName} 安装检测`,
      status: installed ? 'ok' : 'warn',
      detail: installed ? '本机检测到' : '未检测到安装'
    })
  }

  // per-project MCP config + REAL handshake -------------------------------
  const first = projects[0]
  if (first) {
    for (const kind of AGENT_KINDS) {
      const a = adapters[kind]
      if (!a.detectInstallation()) continue
      const st = a.mcpConfigStatus(first.rootPath, first.id)
      findings.push({
        group: 'MCP 配置',
        name: `${a.displayName} · ${first.name}`,
        status: st.configured ? 'ok' : 'warn',
        detail: st.configured
          ? st.path
          : `未配置——去 Agent 接入页点一次「配置 ${a.displayName} 的 MCP」`
      })
      if (st.configured) {
        const r = await spawnMcpCheck(first.id, kind)
        findings.push({
          group: 'MCP 连通',
          name: `${a.displayName} 服务器握手`,
          status: r.tools !== null ? 'ok' : 'fail',
          detail:
            r.tools !== null
              ? `握手成功，暴露 ${r.tools} 个工具`
              : `握手失败：${r.error ?? 'unknown'}`
        })
      }
    }
  }

  return findings
}
