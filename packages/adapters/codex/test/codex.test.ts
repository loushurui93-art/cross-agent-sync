import { beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { applyWrite } from '@cross-agent-sync/adapter-common'
import { createCodexAdapter, hasSection, replaceOrAppendSection } from '../src'

let chome: string
let root: string

beforeEach(() => {
  chome = mkdtempSync(join(tmpdir(), 'cas-chome-'))
  root = mkdtempSync(join(tmpdir(), 'cas-proj-'))
})

const CFG = {
  dbPath: 'C:/data/cas.db',
  projectId: 'proj-1',
  agentId: 'codex',
  serverEntry: 'C:/srv/dist/start.js'
}

describe('codex adapter', () => {
  it('detects installation by the .codex home', () => {
    const a = createCodexAdapter({ home: chome })
    expect(a.detectInstallation()).toBe(true)
    expect(createCodexAdapter({ home: join(chome, 'missing') }).detectInstallation()).toBe(false)
  })

  it('appends the section to an existing config, preserving everything else', () => {
    mkdirSync(chome, { recursive: true })
    const original =
      '# user comment\nmodel = "gpt-5.2"\n\n[mcp_servers.node_repl]\ncommand = "node"\nargs = ["x"]\n'
    writeFileSync(join(chome, 'config.toml'), original, 'utf8')

    const a = createCodexAdapter({ home: chome })
    applyWrite(a.planMcpConfig(root, CFG))

    const saved = readFileSync(join(chome, 'config.toml'), 'utf8')
    expect(saved).toContain('# user comment')
    expect(saved).toContain('model = "gpt-5.2"')
    expect(saved).toContain('[mcp_servers.node_repl]')
    expect(saved).toContain('[mcp_servers.cross-agent-sync]')
    expect(saved).toContain(`args = ["${CFG.serverEntry}"]`)
    expect(saved).toContain(`CAS_PROJECT_ID = "proj-1"`)
    expect(a.mcpConfigStatus(root).configured).toBe(true)
  })

  it('replaces only our section on reconfigure, keeping a backup', () => {
    mkdirSync(chome, { recursive: true })
    writeFileSync(
      join(chome, 'config.toml'),
      replaceOrAppendSection('', `[mcp_servers.cross-agent-sync]\ncommand = "old"\n`) +
        '\n[mcp_servers.other]\ncommand = "y"\n',
      'utf8'
    )
    const a = createCodexAdapter({ home: chome })
    const plan = a.planMcpConfig(root, { ...CFG, serverEntry: 'C:/new/start.js' })
    const res = applyWrite(plan)
    const saved = readFileSync(join(chome, 'config.toml'), 'utf8')
    expect(saved).toContain('C:/new/start.js')
    expect(saved).not.toContain('"old"')
    expect(saved).toContain('[mcp_servers.other]')
    expect(readFileSync(res.backupPath!, 'utf8')).toContain('"old"')
    expect(hasSection(saved)).toBe(true)
  })

  it('generates an AGENTS.md rules file at the project root', () => {
    const a = createCodexAdapter({ home: chome })
    expect(a.rulesFile(root).path).toBe(join(root, 'AGENTS.md'))
  })
})
