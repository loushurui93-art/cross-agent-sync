import { useCallback, useEffect, useState } from 'react'
import type { ProjectRow, TaskRow } from '@cross-agent-sync/core'
import { TASK_STATUSES, type TaskStatus } from '@cross-agent-sync/shared'
import { api, ApiError } from '../lib/api'

const STATUS_LABEL: Record<TaskStatus, string> = {
  todo: '待办',
  in_progress: '进行中',
  blocked: '受阻',
  done: '完成',
  cancelled: '已取消'
}

export default function TasksPage({ active }: { active: ProjectRow | null }): React.ReactElement {
  const [tasks, setTasks] = useState<TaskRow[]>([])
  const [title, setTitle] = useState('')
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async (): Promise<void> => {
    if (!active) return
    try {
      setTasks(await api.tasks.list(active.id))
      setError(null)
    } catch (e) {
      setError(String(e))
    }
  }, [active])

  useEffect(() => {
    if (!active) return
    let cancelled = false
    ;(async () => {
      try {
        const list = await api.tasks.list(active.id)
        if (!cancelled) {
          setTasks(list)
          setError(null)
        }
      } catch (e) {
        if (!cancelled) setError(String(e))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [active])

  if (!active) {
    return <div className="p-6 text-sm text-neutral-500">先在项目页选择或导入一个项目。</div>
  }

  const add = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    if (!title.trim()) return
    try {
      await api.tasks.create({ projectId: active.id, title })
      setTitle('')
      refresh()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err))
    }
  }

  const setStatus = async (t: TaskRow, status: TaskStatus): Promise<void> => {
    try {
      await api.tasks.update({
        projectId: active.id,
        taskId: t.id,
        status,
        expectedVersion: t.version
      })
      refresh()
    } catch (err) {
      setError(
        err instanceof ApiError && err.code === 'VERSION_CONFLICT'
          ? '任务已被其他端更新，正在刷新…'
          : String(err)
      )
      refresh()
    }
  }

  const open = tasks.filter(
    (t) => t.status === 'todo' || t.status === 'in_progress' || t.status === 'blocked'
  )
  const closed = tasks.filter((t) => t.status === 'done' || t.status === 'cancelled')

  return (
    <div className="p-6">
      <h1 className="mb-4 text-xl font-semibold">任务</h1>

      <form onSubmit={add} className="mb-5 flex gap-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="新任务标题"
          className="min-w-0 flex-1 rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm outline-none focus:border-neutral-500"
        />
        <button
          type="submit"
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium hover:bg-blue-500"
        >
          添加
        </button>
      </form>

      {error && <div className="mb-4 text-xs text-red-400">{error}</div>}

      <div className="space-y-2">
        {[...open, ...closed].map((t) => (
          <div
            key={t.id}
            className="flex items-center justify-between rounded-lg border border-neutral-800 bg-neutral-900/40 p-3"
          >
            <div className="min-w-0">
              <div
                className={`text-sm ${t.status === 'done' ? 'text-neutral-500 line-through' : ''}`}
              >
                {t.title}
              </div>
              <div className="mt-0.5 text-xs text-neutral-500">
                v{t.version} · 更新于 {new Date(t.updatedAt).toLocaleString()}
              </div>
            </div>
            <select
              value={t.status}
              onChange={(e) => setStatus(t, e.target.value as TaskStatus)}
              className="shrink-0 rounded border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-xs"
            >
              {TASK_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </div>
        ))}
        {tasks.length === 0 && (
          <div className="rounded-lg border border-dashed border-neutral-800 p-6 text-center text-sm text-neutral-500">
            暂无任务
          </div>
        )}
      </div>
    </div>
  )
}
