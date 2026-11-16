import { useEffect, useState } from 'react'
import { api, ApiError } from '../lib/api'

interface BackupRow {
  name: string
  file: string
}

export default function SettingsPage(): React.ReactElement {
  const [backups, setBackups] = useState<BackupRow[]>([])
  const [message, setMessage] = useState<string | null>(null)

  const refresh = async (): Promise<void> => {
    try {
      setBackups(await api.data.listBackups())
    } catch (e) {
      setMessage(String(e))
    }
  }

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const list = await api.data.listBackups()
        if (!cancelled) setBackups(list)
      } catch {
        /* ignore */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const backup = async (): Promise<void> => {
    try {
      const r = await api.data.backup()
      setMessage(`已备份到 ${r.file}`)
      await refresh()
    } catch (e) {
      setMessage(String(e))
    }
  }

  const restore = async (name: string): Promise<void> => {
    if (
      !window.confirm(`用备份「${name}」覆盖当前数据？\n（覆盖前会自动再做一次当前数据的快照）`)
    ) {
      return
    }
    try {
      await api.data.restore(name)
      setMessage(`已从 ${name} 恢复。页面数据需刷新后生效（建议重启应用）。`)
    } catch (e) {
      setMessage(e instanceof ApiError ? `${e.code}: ${e.message}` : String(e))
    }
  }

  return (
    <div className="p-6">
      <h1 className="mb-4 text-xl font-semibold">设置</h1>

      <div className="mb-6 rounded-lg border border-neutral-800 bg-neutral-900/40 p-4">
        <div className="mb-2 text-sm font-medium">数据备份与恢复</div>
        <p className="mb-3 text-xs text-neutral-500">
          备份包含项目/任务/交接/会话索引数据库（项目里的 .agent-sync/ Markdown
          文件本身就在磁盘上，建议随项目进 Git）。
        </p>
        <button
          onClick={backup}
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium hover:bg-blue-500"
        >
          立即备份
        </button>
        {message && <div className="mt-3 break-all text-xs text-neutral-400">{message}</div>}
        <div className="mt-4 space-y-1">
          {backups.map((b) => (
            <div
              key={b.name}
              className="flex items-center justify-between rounded border border-neutral-800 px-3 py-2 text-xs"
            >
              <span className="truncate text-neutral-300">{b.name}</span>
              <button
                onClick={() => restore(b.name)}
                className="ml-3 shrink-0 rounded bg-neutral-800 px-3 py-1 hover:bg-neutral-700"
              >
                恢复
              </button>
            </div>
          ))}
          {backups.length === 0 && <div className="text-xs text-neutral-500">暂无备份</div>}
        </div>
      </div>

      <div className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-4 text-xs text-neutral-500">
        Cross-Agent Sync v0.1.0 (Beta) · 数据目录：用户 AppData · Local-first：无任何网络上报
      </div>
    </div>
  )
}
