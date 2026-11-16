import { beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { applyWrite } from '@cross-agent-sync/adapter-common'
import { createZcodeAdapter } from '../src'

let zhome: string
let root: string

beforeEach(() => {
  zhome = mkdtempSync(join(tmpdir(), 'cas-zhome-'))
  root = mkdtempSync(join(tmpdir(), 'cas-proj-'))
})

const CFG: McpCfg = {
  dbPath: 'C:/data/cas.db',
  projectId: 'proj-1',
  agentId: 'zcode',
  serverEntry: 'C:/srv/dist/start.js'
}
type McpCfg = Parameters<ReturnType<typeof createZcodeAdapter>['planMcpConfig']>[1]

describe('zcode adapter', () => {
  it('detects installation by the .zcode home', () => {
    const a = createZcodeAdapter({ home: zhome })
    expect(a.detectInstallation()).toBe(true)
    expect(createZcodeAdapter({ home: join(zhome, 'missing') }).detectInstallation()).toBe(false)
  })

  it('merges the server into an existing workspace config without clobbering', () => {
    mkdirSync(join(root, '.zcode'), { recursive: true })
    writeFileSync(
      join(root, '.zcode', 'config.json'),
      JSON.stringify({ plugins: { keep: true }, mcp: { servers: { other: { command: 'x' } } } }),
      'utf8'
    )
    const a = createZcodeAdapter({ home: zhome })
    const plan = a.planMcpConfig(root, CFG)
    applyWrite(plan)

    const saved = JSON.parse(readFileSync(join(root, '.zcode', 'config.json'), 'utf8'))
    expect(saved.plugins.keep).toBe(true)
    expect(saved.mcp.servers.other).toEqual({ command: 'x' })
    const entry = saved.mcp.servers['cross-agent-sync']
    expect(entry.type).toBe('stdio')
    expect(entry.command).toBeTruthy()
    expect(entry.args[0]).toBe(CFG.serverEntry)
    expect(entry.env.CAS_PROJECT_ID).toBe('proj-1')
    // no unknown keys (strict schema would drop the server)
    expect(Object.keys(entry).sort()).toEqual(['args', 'command', 'env', 'type'])
    expect(a.mcpConfigStatus(root).configured).toBe(true)
  })

  it('refuses to touch an invalid JSON config', () => {
    mkdirSync(join(root, '.zcode'), { recursive: true })
    writeFileSync(join(root, '.zcode', 'config.json'), '{broken', 'utf8')
    const a = createZcodeAdapter({ home: zhome })
    expect(() => a.planMcpConfig(root, CFG)).toThrow(/not valid JSON/)
  })

  it('warns when the user-level config shadows the workspace server', () => {
    mkdirSync(join(zhome, 'cli'), { recursive: true })
    writeFileSync(
      join(zhome, 'cli', 'config.json'),
      JSON.stringify({ mcp: { servers: { 'cross-agent-sync': { command: 'old' } } } }),
      'utf8'
    )
    const a = createZcodeAdapter({ home: zhome })
    const st = a.mcpConfigStatus(root)
    expect(st.shadowed).toBe(true)
    expect(st.shadowedBy).toContain(join('cli', 'config.json'))
  })

  it('generates an AGENTS.md rules file', () => {
    const a = createZcodeAdapter({ home: zhome })
    const f = a.rulesFile(root)
    expect(f.path).toBe(join(root, 'AGENTS.md'))
    expect(f.content).toContain('cross-agent-sync')
  })
})
