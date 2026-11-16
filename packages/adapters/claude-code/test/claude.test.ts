import { beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { applyWrite } from '@cross-agent-sync/adapter-common'
import { createClaudeCodeAdapter, claudeMdContent } from '../src'

let chome: string
let root: string

beforeEach(() => {
  chome = mkdtempSync(join(tmpdir(), 'cas-clhome-'))
  root = mkdtempSync(join(tmpdir(), 'cas-proj-'))
})

const CFG = {
  dbPath: 'C:/data/cas.db',
  projectId: '2363e5c4-a254-4888-ba88-1e7abe25b3cb',
  agentId: 'claude-code',
  serverEntry: 'C:/srv/dist/start.js'
}
const ENTRY = 'cross-agent-sync-2363e5c4'

describe('claude-code adapter', () => {
  it('detects installation by the .claude home', () => {
    const a = createClaudeCodeAdapter({ home: chome })
    expect(a.detectInstallation()).toBe(true)
    expect(createClaudeCodeAdapter({ home: join(chome, 'no') }).detectInstallation()).toBe(false)
  })

  it('creates .mcp.json with a per-project server, preserving other content', () => {
    writeFileSync(join(root, '.mcp.json'), JSON.stringify({ mcpServers: { other: { command: 'x' } } }), 'utf8')
    const a = createClaudeCodeAdapter({ home: chome })
    applyWrite(a.planMcpConfig(root, CFG))

    const saved = JSON.parse(readFileSync(join(root, '.mcp.json'), 'utf8'))
    expect(saved.mcpServers.other).toEqual({ command: 'x' })
    const entry = saved.mcpServers[ENTRY]
    expect(entry.command).toBeTruthy()
    expect(entry.args[0]).toBe(CFG.serverEntry)
    expect(entry.env.CAS_PROJECT_ID).toBe(CFG.projectId)
    expect(a.mcpConfigStatus(root, CFG.projectId).configured).toBe(true)
  })

  it('refuses to touch invalid JSON and removes its entry on cleanup', () => {
    const a = createClaudeCodeAdapter({ home: chome })
    writeFileSync(join(root, '.mcp.json'), '{bad', 'utf8')
    expect(() => a.planMcpConfig(root, CFG)).toThrow(/not valid JSON/)

    mkdirSync(root, { recursive: true })
    writeFileSync(join(root, '.mcp.json'), JSON.stringify({ mcpServers: { [ENTRY]: { command: 'x' } } }), 'utf8')
    a.removeMcpConfig(root, CFG.projectId)
    const saved = JSON.parse(readFileSync(join(root, '.mcp.json'), 'utf8'))
    expect(saved.mcpServers[ENTRY]).toBeUndefined()
  })

  it('generates a CLAUDE.md that imports the shared AGENTS.md', () => {
    const a = createClaudeCodeAdapter({ home: chome })
    const f = a.rulesFile(root)
    expect(f.path).toBe(join(root, 'CLAUDE.md'))
    expect(f.content).toContain('@AGENTS.md')
    expect(claudeMdContent('demo')).toContain('managed by cross-agent-sync')
  })
})
