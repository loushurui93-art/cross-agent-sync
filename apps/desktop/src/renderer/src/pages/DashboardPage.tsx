import { useEffect, useState } from 'react'
import type { ProjectRow, TaskRow } from '@cross-agent-sync/core'
import { api } from '../lib/api'

export default function DashboardPage({
  active,
  projects,
  go
}: {
  active: ProjectRow | null
  projects: ProjectRow[]
  go: (page: 'dashboard' | 'projects' | 'context' | 'tasks') => void
}): React.ReactElement {
  const [tasks, setTasks] = useState<TaskRow[]>([])

  useEffect(() => {
    if (!active) return
    api.tasks
      .list(active.id)
      .then(setTasks)
      .catch(() => setTasks([]))
  }, [active])

  const open = tasks.filter((t) => t.status !== 'done' && t.status !== 'cancelled')

  return (
    <div className="p-6">
      <h1 className="mb-1 text-xl font-semibold">仪表盘</h1>
      <p className="mb-6 text-sm text-neutral-500">
        跨 Agent 的项目共享上下文工作空间（ZCode ⇄ Codex）
      </p>

      <div className="grid grid-cols-3 gap-4">
        <Stat label="项目数" value={String(projects.length)} onClick={() => go('projects')} />
        <Stat label="进行中任务" value={String(open.length)} onClick={() => go('tasks')} />
        <Stat label="当前项目" value={active ? active.name : '—'} onClick={() => go('context')} />
      </div>

      {active ? (
        <div className="mt-6 rounded-lg border border-neutral-800 bg-neutral-900/40 p-4">
          <div className="text-sm font-medium">{active.name}</div>
          <div className="mt-1 text-xs text-neutral-500">{active.rootPath}</div>
          <div className="mt-3 flex gap-2">
            <button
              className="rounded bg-neutral-800 px-3 py-1.5 text-xs hover:bg-neutral-700"
              onClick={() => go('context')}
            >
              编辑上下文
            </button>
            <button
              className="rounded bg-neutral-800 px-3 py-1.5 text-xs hover:bg-neutral-700"
              onClick={() => go('tasks')}
            >
              查看任务
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-6 rounded-lg border border-dashed border-neutral-800 p-8 text-center text-sm text-neutral-500">
          还没有项目。去
          <button className="mx-1 underline" onClick={() => go('projects')}>
            项目页
          </button>
          导入一个本地目录开始。
        </div>
      )}
    </div>
  )
}

function Stat({
  label,
  value,
  onClick
}: {
  label: string
  value: string
  onClick: () => void
}): React.ReactElement {
  return (
    <button
      onClick={onClick}
      className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-4 text-left hover:border-neutral-600"
    >
      <div className="text-xs text-neutral-500">{label}</div>
      <div className="mt-1 truncate text-lg font-semibold">{value}</div>
    </button>
  )
}
