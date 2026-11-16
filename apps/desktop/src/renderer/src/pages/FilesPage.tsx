import { useEffect, useState } from 'react'
import type { ProjectRow } from '@cross-agent-sync/core'
import { api, type FileEventRow, type GitStatus } from '../lib/api'

export default function FilesPage({ active }: { active: ProjectRow | null }): React.ReactElement {
  const [events, setEvents] = useState<FileEventRow[]>([])
  const [git, setGit] = useState<GitStatus | null>(null)

  useEffect(() => {
    if (!active) return
    let cancelled = false
    ;(async () => {
      try {
        const [ev, st] = await Promise.all([
          api.files.events(active.id),
          api.files.git(active.rootPath)
        ])
        if (!cancelled) {
          setEvents(ev)
          setGit(st)
        }
      } catch {
        /* ignore */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [active])

  if (!active) {
    return <div className="p-6 text-sm text-neutral-500">先在项目页选择或导入一个项目。</div>
  }

  return (
    <div className="p-6">
      <h1 className="mb-1 text-xl font-semibold">文件</h1>
      <p className="mb-5 text-xs text-neutral-500">
        项目文件变化（后台自动监听，忽略构建目录与敏感文件）与 Git 只读状态。
      </p>

      <div className="mb-6 rounded-lg border border-neutral-800 bg-neutral-900/40 p-4">
        <div className="mb-2 text-sm font-medium">Git 状态</div>
        {git?.isRepo ? (
          <>
            <div className="text-xs text-neutral-400">
              分支 <span className="text-neutral-200">{git.branch}</span> ·{' '}
              {git.clean ? '工作区干净' : `${git.changedFiles.length} 个未提交变更`}
            </div>
            {git.changedFiles.length > 0 && (
              <ul className="mt-2 max-h-32 space-y-0.5 overflow-auto text-xs text-neutral-500">
                {git.changedFiles.slice(0, 20).map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            )}
            {git.recentCommits.length > 0 && (
              <div className="mt-3">
                <div className="mb-1 text-xs text-neutral-500">最近提交</div>
                <ul className="space-y-0.5 text-xs">
                  {git.recentCommits.map((c) => (
                    <li key={c.hash} className="text-neutral-400">
                      <span className="text-neutral-200">{c.hash}</span> {c.subject}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        ) : (
          <div className="text-xs text-neutral-500">该目录不是 Git 仓库。</div>
        )}
      </div>

      <div className="mb-2 text-sm font-medium">最近文件变化（监听器 + Agent 上报）</div>
      <div className="space-y-1">
        {events.map((e) => (
          <div
            key={e.id}
            className="flex items-center justify-between rounded border border-neutral-800 bg-neutral-900/40 px-3 py-2 text-xs"
          >
            <span className="truncate text-neutral-300">{e.relativePath}</span>
            <span className="ml-3 shrink-0 text-neutral-500">
              {e.eventType}
              {e.agentId ? ` · ${e.agentId} 上报` : ' · 监听'}
            </span>
          </div>
        ))}
        {events.length === 0 && (
          <div className="rounded-lg border border-dashed border-neutral-800 p-6 text-center text-sm text-neutral-500">
            暂无记录（应用运行期间的变化会被自动记录）
          </div>
        )}
      </div>
    </div>
  )
}
