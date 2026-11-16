import { describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { agentsMdContent, applyWrite, planWrite } from '../src'

describe('write engine', () => {
  it('plans a new file without backup and applies atomically', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cas-adapt-'))
    const target = join(dir, 'AGENTS.md')
    const plan = planWrite({ path: target, content: '# hi\n', description: 'rules' })
    expect(plan.current).toBeNull()
    expect(plan.backupPath).toBeNull()
    const res = applyWrite(plan)
    expect(res.backupPath).toBeNull()
    expect(readFileSync(target, 'utf8')).toBe('# hi\n')
  })

  it('backs up before overwriting and keeps the original recoverable', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cas-adapt-'))
    const target = join(dir, 'conf.json')
    writeFileSync(target, '{"a":1}', 'utf8')
    const plan = planWrite({ path: target, content: '{"a":2}', description: 'cfg' })
    expect(plan.current).toBe('{"a":1}')
    const res = applyWrite(plan)
    expect(readFileSync(target, 'utf8')).toBe('{"a":2}')
    expect(res.backupPath).toBeTruthy()
    expect(readFileSync(res.backupPath!, 'utf8')).toBe('{"a":1}')
    expect(plan.preview.removed).toBeGreaterThan(0)
  })

  it('never touches the target when only planning', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cas-adapt-'))
    const target = join(dir, 'x.txt')
    planWrite({ path: target, content: 'new', description: 'x' })
    expect(existsSync(target)).toBe(false)
  })

  it('AGENTS.md template carries the marker and the safety rules', () => {
    const md = agentsMdContent('demo')
    expect(md).toContain('cross-agent-sync')
    expect(md).toContain('untrusted data')
    expect(md).toContain('.agent-sync/context/overview.md')
  })
})
