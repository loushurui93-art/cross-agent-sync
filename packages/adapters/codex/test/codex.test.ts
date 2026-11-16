import { beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { applyWrite } from '@cross-agent-sync/adapter-common'
import { createCodexAdapter, hasSection, removeSection, replaceOrAppendSection } from '../src'

let chome: string
let root: string

beforeEach(() => {
  chome = mkdtempSync(join(tmpdir(), 'cas-chome-'))
  root = mkdtempSync(join(tmpdir(), 'cas-proj-'))
})

const CFG = {
  dbPath: 'C:/data/cas.db',
  projectId: '2363e5c4-a254-4888-ba88-1e7abe25b3cb',
  agentId: 'codex',
  serverEntry: 'C:/srv/dist/start.js'
}
const SECTION = '[mcp_servers.cross-agent-sync-2363e5c4]'

describe('codex adapter', () => {
  it('detects installation by the .codex home', () => {
    const a = createCodexAdapter({ home: chome })
    expect(a.detectInstallation()).toBe(true)
    expect(createCodexAdapter({ home: join(chome, 'missing') }).detectInstallation()).toBe(false)
  })

  it('appends a per-project section, preserving everything else', () => {
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
    expect(saved).toContain(SECTION)
    expect(saved).toContain(`CAS_PROJECT_ID = "${CFG.projectId}"`)
    expect(a.mcpConfigStatus(root, CFG.projectId).configured).toBe(true)
  })

  it('two projects coexist as separate sections', () => {
    mkdirSync(chome, { recursive: true })
    const a = createCodexAdapter({ home: chome })
    applyWrite(a.planMcpConfig(root, CFG))
    applyWrite(a.planMcpConfig(root, { ...CFG, projectId: '99aaaaaaa-0000-0000-0000-00000000000' }))
    const saved = readFileSync(join(chome, 'config.toml'), 'utf8')
    expect(hasSection(saved, 'mcp_servers.cross-agent-sync-2363e5c4')).toBe(true)
    expect(hasSection(saved, 'mcp_servers.cross-agent-sync-99aaaaaa')).toBe(true)
  })

  it('replaces only our section on reconfigure and drops the legacy one', () => {
    mkdirSync(chome, { recursive: true })
    writeFileSync(
      join(chome, 'config.toml'),
      '[mcp_servers.cross-agent-sync]\ncommand = "old"\n\n[mcp_servers.other]\ncommand = "y"\n',
      'utf8'
    )
    const a = createCodexAdapter({ home: chome })
    const plan = a.planMcpConfig(root, { ...CFG, serverEntry: 'C:/new/start.js' })
    const res = applyWrite(plan)
    const saved = readFileSync(join(chome, 'config.toml'), 'utf8')
    expect(saved).toContain('C:/new/start.js')
    expect(saved).not.toContain('"old"')
    expect(saved).not.toContain('[mcp_servers.cross-agent-sync]')
    expect(saved).toContain(SECTION)
    expect(saved).toContain('[mcp_servers.other]')
    expect(readFileSync(res.backupPath!, 'utf8')).toContain('"old"')
  })

  it('removeMcpConfig deletes the section cleanly', () => {
    mkdirSync(chome, { recursive: true })
    const a = createCodexAdapter({ home: chome })
    applyWrite(a.planMcpConfig(root, CFG))
    a.removeMcpConfig(root, CFG.projectId)
    const saved = readFileSync(join(chome, 'config.toml'), 'utf8')
    expect(hasSection(saved, 'mcp_servers.cross-agent-sync-2363e5c4')).toBe(false)
  })

  it('section primitives: replace/remove keep surrounding content', () => {
    const base = 'top = 1\n\n[a]\nx = 1\n\n[b]\ny = 2\n'
    const replaced = replaceOrAppendSection(base, 'a', '[a]\nx = 9')
    expect(replaced).toContain('top = 1')
    expect(replaced).toContain('[b]')
    expect(replaced).toContain('x = 9')
    const removed = removeSection(replaced, 'a')
    expect(removed).not.toContain('[a]')
    expect(removed).toContain('[b]')
    expect(removed).toContain('top = 1')
  })

  it('generates an AGENTS.md rules file at the project root', () => {
    const a = createCodexAdapter({ home: chome })
    expect(a.rulesFile(root).path).toBe(join(root, 'AGENTS.md'))
  })
})
