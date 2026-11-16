import { beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
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

const CFG = {
  dbPath: 'C:/data/cas.db',
  projectId: '2363e5c4-a254-4888-ba88-1e7abe25b3cb',
  agentId: 'zcode',
  serverEntry: 'C:/srv/dist/start.js'
}

const USER_CONFIG = (home: string): string => join(home, 'cli', 'config.json')
const ENTRY_NAME = 'cross-agent-sync-2363e5c4'

describe('zcode adapter', () => {
  it('detects installation by the .zcode home', () => {
    const a = createZcodeAdapter({ home: zhome })
    expect(a.detectInstallation()).toBe(true)
    expect(createZcodeAdapter({ home: join(zhome, 'missing') }).detectInstallation()).toBe(false)
  })

  it('writes a per-project entry into the USER-level config, preserving existing keys', () => {
    mkdirSync(join(zhome, 'cli'), { recursive: true })
    writeFileSync(
      USER_CONFIG(zhome),
      JSON.stringify({ plugins: { keep: true }, mcp: { servers: { other: { command: 'x' } } } }),
      'utf8'
    )
    const a = createZcodeAdapter({ home: zhome })
    applyWrite(a.planMcpConfig(root, CFG))

    const saved = JSON.parse(readFileSync(USER_CONFIG(zhome), 'utf8'))
    expect(saved.plugins.keep).toBe(true)
    expect(saved.mcp.servers.other).toEqual({ command: 'x' })
    const entry = saved.mcp.servers[ENTRY_NAME]
    expect(entry.type).toBe('stdio')
    expect(entry.args[0]).toBe(CFG.serverEntry)
    expect(entry.env.CAS_PROJECT_ID).toBe(CFG.projectId)
    // strict schema: no unknown keys
    expect(Object.keys(entry).sort()).toEqual(['args', 'command', 'env', 'type'])
    expect(a.mcpConfigStatus(root, CFG.projectId).configured).toBe(true)
  })

  it('two projects coexist without shadowing (per-project names)', () => {
    const a = createZcodeAdapter({ home: zhome })
    applyWrite(a.planMcpConfig(root, CFG))
    applyWrite(
      a.planMcpConfig(root, { ...CFG, projectId: '99aaaaaaaa-0000-0000-0000-000000000000' })
    )
    const saved = JSON.parse(readFileSync(USER_CONFIG(zhome), 'utf8'))
    expect(Object.keys(saved.mcp.servers).sort()).toEqual([
      'cross-agent-sync-2363e5c4',
      'cross-agent-sync-99aaaaaa'
    ])
  })

  it('drops the legacy fixed-name entry while writing', () => {
    mkdirSync(join(zhome, 'cli'), { recursive: true })
    writeFileSync(
      USER_CONFIG(zhome),
      JSON.stringify({ mcp: { servers: { 'cross-agent-sync': { command: 'old' } } } }),
      'utf8'
    )
    const a = createZcodeAdapter({ home: zhome })
    applyWrite(a.planMcpConfig(root, CFG))
    const saved = JSON.parse(readFileSync(USER_CONFIG(zhome), 'utf8'))
    expect(saved.mcp.servers['cross-agent-sync']).toBeUndefined()
    expect(saved.mcp.servers[ENTRY_NAME]).toBeTruthy()
    expect(a.mcpConfigStatus(root, CFG.projectId).shadowed).toBe(false)
  })

  it('refuses to touch an invalid JSON config', () => {
    mkdirSync(join(zhome, 'cli'), { recursive: true })
    writeFileSync(USER_CONFIG(zhome), '{broken', 'utf8')
    const a = createZcodeAdapter({ home: zhome })
    expect(() => a.planMcpConfig(root, CFG)).toThrow(/not valid JSON/)
  })

  it('removeMcpConfig deletes this project entry (and legacy), with backup', () => {
    const a = createZcodeAdapter({ home: zhome })
    applyWrite(a.planMcpConfig(root, CFG))
    expect(existsSync(USER_CONFIG(zhome))).toBe(true)
    a.removeMcpConfig(root, CFG.projectId)
    const saved = JSON.parse(readFileSync(USER_CONFIG(zhome), 'utf8'))
    expect(saved.mcp.servers[ENTRY_NAME]).toBeUndefined()
  })

  it('generates an AGENTS.md rules file', () => {
    const a = createZcodeAdapter({ home: zhome })
    const f = a.rulesFile(root)
    expect(f.path).toBe(join(root, 'AGENTS.md'))
    expect(f.content).toContain('cross-agent-sync')
  })
})
