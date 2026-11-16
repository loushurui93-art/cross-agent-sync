import { useState } from 'react'
import type { ProjectRow } from '@cross-agent-sync/core'
import { api, ApiError } from '../lib/api'

export default function ProjectsPage({
  projects,
  activeId,
  onChanged,
  onSelect
}: {
  projects: ProjectRow[]
  activeId: string | null
  onChanged: () => void
  onSelect: (id: string) => void
}): React.ReactElement {
  const [name, setName] = useState('')
  const [rootPath, setRootPath] = useState('')
  const [description, setDescription] = useState('')
  const [template, setTemplate] = useState<'default' | 'frontend' | 'backend' | 'research'>(
    'default'
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const pick = async (): Promise<void> => {
    const dir = await api.dialog.pickDirectory()
    if (dir) {
      setRootPath(dir)
      if (!name) setName(dir.split(/[\\/]/).pop() || '')
    }
  }

  const submit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    if (!name.trim() || !rootPath.trim()) return
    setBusy(true)
    setError(null)
    try {
      const p = await api.projects.create({
        name,
        rootPath,
        description: description || undefined,
        template
      })
      onSelect(p.id)
      setName('')
      setRootPath('')
      setDescription('')
      onChanged()
    } catch (err) {
      setError(err instanceof ApiError ? `${err.code}: ${err.message}` : String(err))
    } finally {
      setBusy(false)
    }
  }

  const remove = async (p: ProjectRow): Promise<void> => {
    // Removing only un-manages the project; source files stay (guide §14.3).
    const sure = window.confirm(
      `解除对项目「${p.name}」的管理？\n（不会删除磁盘上的任何文件，包括 .agent-sync/）`
    )
    if (!sure) return
    await api.projects.remove(p.id)
    onChanged()
  }

  return (
    <div className="p-6">
      <h1 className="mb-4 text-xl font-semibold">项目</h1>

      <form
        onSubmit={submit}
        className="mb-6 rounded-lg border border-neutral-800 bg-neutral-900/40 p-4"
      >
        <div className="mb-3 text-sm font-medium text-neutral-300">导入本地目录作为项目</div>
        <div className="grid grid-cols-2 gap-3">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="项目名称"
            className="rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm outline-none focus:border-neutral-500"
          />
          <div className="flex gap-2">
            <input
              value={rootPath}
              onChange={(e) => setRootPath(e.target.value)}
              placeholder="项目根目录"
              className="min-w-0 flex-1 rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm outline-none focus:border-neutral-500"
            />
            <button
              type="button"
              onClick={pick}
              className="shrink-0 rounded bg-neutral-800 px-3 text-sm hover:bg-neutral-700"
            >
              浏览…
            </button>
          </div>
        </div>
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="描述（可选）"
          className="mt-3 w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm outline-none focus:border-neutral-500"
        />
        <select
          value={template}
          onChange={(e) =>
            setTemplate(e.target.value as 'default' | 'frontend' | 'backend' | 'research')
          }
          className="mt-3 w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm outline-none focus:border-neutral-500"
        >
          <option value="default">模板：通用</option>
          <option value="frontend">模板：前端项目</option>
          <option value="backend">模板：后端项目</option>
          <option value="research">模板：研究 / 实验</option>
        </select>
        {error && <div className="mt-3 text-xs text-red-400">{error}</div>}
        <button
          type="submit"
          disabled={busy}
          className="mt-3 rounded bg-blue-600 px-4 py-2 text-sm font-medium hover:bg-blue-500 disabled:opacity-50"
        >
          {busy ? '创建中…' : '创建项目'}
        </button>
      </form>

      <div className="space-y-2">
        {projects.map((p) => (
          <div
            key={p.id}
            className={`flex items-center justify-between rounded-lg border p-4 ${
              p.id === activeId
                ? 'border-blue-700 bg-blue-950/20'
                : 'border-neutral-800 bg-neutral-900/40'
            }`}
          >
            <div className="min-w-0">
              <div className="text-sm font-medium">
                {p.name}
                {p.id === activeId && <span className="ml-2 text-xs text-blue-400">当前</span>}
              </div>
              <div className="truncate text-xs text-neutral-500" title={p.rootPath}>
                {p.rootPath}
              </div>
              {p.description && (
                <div className="mt-1 truncate text-xs text-neutral-400">{p.description}</div>
              )}
            </div>
            <div className="flex shrink-0 gap-2">
              <button
                onClick={() => onSelect(p.id)}
                className="rounded bg-neutral-800 px-3 py-1.5 text-xs hover:bg-neutral-700"
              >
                设为当前
              </button>
              <button
                onClick={() => remove(p)}
                className="rounded border border-red-900 px-3 py-1.5 text-xs text-red-400 hover:bg-red-950/40"
              >
                解除管理
              </button>
            </div>
          </div>
        ))}
        {projects.length === 0 && (
          <div className="rounded-lg border border-dashed border-neutral-800 p-6 text-center text-sm text-neutral-500">
            暂无项目
          </div>
        )}
      </div>
    </div>
  )
}
