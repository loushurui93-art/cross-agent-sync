import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { describe, expect, it } from 'vitest'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { repoStatus } from '../src'

const run = promisify(execFile)

describe('git-service (read-only)', () => {
  it('reports a non-repo directory as such', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'cas-git-'))
    const st = await repoStatus(dir)
    expect(st.isRepo).toBe(false)
    expect(st.branch).toBeNull()
  })

  it('reports branch/dirty state/commits for a real repo', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'cas-git-'))
    await run('git', ['init', '-q'], { cwd: dir })
    await run('git', ['config', 'user.email', 't@t'], { cwd: dir })
    await run('git', ['config', 'user.name', 't'], { cwd: dir })
    writeFileSync(join(dir, 'a.txt'), 'hello')
    await run('git', ['add', '.'], { cwd: dir })
    await run('git', ['commit', '-q', '-m', 'first'], { cwd: dir })

    const st = await repoStatus(dir)
    expect(st.isRepo).toBe(true)
    expect(st.clean).toBe(true)
    expect(st.recentCommits[0].subject).toBe('first')

    writeFileSync(join(dir, 'b.txt'), 'dirty')
    const st2 = await repoStatus(dir)
    expect(st2.clean).toBe(false)
    expect(st2.changedFiles).toContain('b.txt')
  })
})
