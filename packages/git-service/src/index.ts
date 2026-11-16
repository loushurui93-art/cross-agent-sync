/**
 * Read-only Git integration (guide §12.3): repo detection, branch, working
 * tree state and recent commits via the system `git`. No state-changing
 * commands are ever issued here.
 */

import { execFile } from 'node:child_process'

function git(root: string, args: string[], timeoutMs = 5000): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      'git',
      args,
      { cwd: root, timeout: timeoutMs, windowsHide: true },
      (err, stdout, stderr) => {
        if (err) reject(new Error(`git ${args[0]}: ${stderr || err.message}`))
        else resolve(stdout)
      }
    )
  })
}

export interface RepoStatus {
  isRepo: boolean
  branch: string | null
  clean: boolean
  changedFiles: string[]
  recentCommits: Array<{ hash: string; author: string; date: string; subject: string }>
}

export async function isRepo(root: string): Promise<boolean> {
  try {
    const out = await git(root, ['rev-parse', '--is-inside-work-tree'])
    return out.trim() === 'true'
  } catch {
    return false
  }
}

export async function repoStatus(root: string): Promise<RepoStatus> {
  if (!(await isRepo(root))) {
    return { isRepo: false, branch: null, clean: true, changedFiles: [], recentCommits: [] }
  }
  const [branch, porcelain, log] = await Promise.all([
    git(root, ['branch', '--show-current']).catch(() => ''),
    git(root, ['status', '--porcelain']),
    git(root, ['log', '-n', '5', '--pretty=format:%h|%an|%ad|%s', '--date=iso']).catch(() => '')
  ])
  const changedFiles = porcelain
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => l.slice(3).trim())
  const recentCommits = log
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [hash, author, date, ...rest] = line.split('|')
      return { hash, author, date, subject: rest.join('|') }
    })
  return {
    isRepo: true,
    branch: branch.trim() || null,
    clean: changedFiles.length === 0,
    changedFiles,
    recentCommits
  }
}
