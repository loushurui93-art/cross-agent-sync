import { useEffect, useState } from 'react'
import type { ProjectRow } from '@cross-agent-sync/core'
import { api, ApiError, type ConversationRow, type MessageRow, type SearchHit } from '../lib/api'

export default function ConversationsPage({
  active
}: {
  active: ProjectRow | null
}): React.ReactElement {
  const [rows, setRows] = useState<ConversationRow[]>([])
  const [busy, setBusy] = useState(false)
  const [summary, setSummary] = useState<string | null>(null)
  const [open, setOpen] = useState<{ title: string; messages: MessageRow[] } | null>(null)
  const [query, setQuery] = useState('')
  const [agentFilter, setAgentFilter] = useState('all')
  const [sinceDays, setSinceDays] = useState<number | null>(null)
  const [hits, setHits] = useState<SearchHit[] | null>(null)

  const refresh = async (): Promise<void> => {
    if (!active) return
    setRows(await api.conv.list(active.id))
  }

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const list = active ? await api.conv.list(active.id) : []
        if (!cancelled) setRows(list)
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

  const doImport = async (): Promise<void> => {
    setBusy(true)
    setSummary(null)
    try {
      const s = await api.conv.import(active.id)
      const fmt = (
        n: { imported: number; updated: number; alreadyImported: number },
        found: number
      ): string =>
        `新导入 ${n.imported} · 更新 ${n.updated} / 共 ${found}（未变 ${n.alreadyImported}）`
      setSummary(`ZCode：${fmt(s.zcode, s.found.zcode)} · Codex：${fmt(s.codex, s.found.codex)}`)
      await refresh()
    } catch (e) {
      setSummary(e instanceof ApiError ? `${e.code}: ${e.message}` : String(e))
    } finally {
      setBusy(false)
    }
  }

  const showMessages = async (c: ConversationRow): Promise<void> => {
    const messages = await api.conv.messages(c.id)
    setOpen({ title: c.title || '(untitled)', messages })
  }

  const doSearch = async (): Promise<void> => {
    if (!query.trim()) {
      setHits(null)
      return
    }
    try {
      setHits(
        await api.conv.search({
          query,
          projectId: active.id,
          agentId: agentFilter === 'all' ? undefined : agentFilter,
          sinceDays: sinceDays ?? undefined
        })
      )
    } catch {
      setHits([])
    }
  }

  return (
    <div className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">会话</h1>
        <button
          onClick={doImport}
          disabled={busy}
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium hover:bg-blue-500 disabled:opacity-50"
        >
          {busy ? '导入中…' : '从 ZCode / Codex 导入'}
        </button>
      </div>
      <p className="mb-4 text-xs text-neutral-500">
        只读扫描两边本地会话记录中属于「{active.name}
        」目录的部分，导入统一索引供搜索（不修改任何源数据）。
      </p>
      {summary && (
        <div className="mb-4 rounded border border-neutral-700 bg-neutral-900/60 px-4 py-2 text-xs text-neutral-300">
          {summary}
        </div>
      )}

      <div className="mb-5 flex gap-2">
        <select
          value={agentFilter}
          onChange={(e) => setAgentFilter(e.target.value)}
          className="rounded border border-neutral-700 bg-neutral-900 px-2 py-2 text-sm"
        >
          <option value="all">全部来源</option>
          <option value="zcode">ZCode</option>
          <option value="codex">Codex</option>
        </select>
        <select
          value={sinceDays ?? ''}
          onChange={(e) => setSinceDays(e.target.value ? Number(e.target.value) : null)}
          className="rounded border border-neutral-700 bg-neutral-900 px-2 py-2 text-sm"
        >
          <option value="">全部时间</option>
          <option value="7">最近 7 天</option>
          <option value="30">最近 30 天</option>
          <option value="90">最近 90 天</option>
        </select>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && doSearch()}
          placeholder="全文搜索已导入的消息…"
          className="min-w-0 flex-1 rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm outline-none focus:border-neutral-500"
        />
        <button
          onClick={doSearch}
          className="rounded bg-neutral-800 px-4 py-2 text-sm hover:bg-neutral-700"
        >
          搜索
        </button>
      </div>

      {hits && (
        <div className="mb-5 space-y-2">
          <div className="text-xs text-neutral-500">{hits.length} 条命中</div>
          {hits.map((h, i) => (
            <button
              key={i}
              onClick={() => {
                const row = rows.find((r) => r.id === h.conversationId)
                if (row) showMessages(row)
              }}
              className="block w-full rounded border border-neutral-800 bg-neutral-900/40 p-3 text-left hover:border-neutral-600"
            >
              <div className="mb-1 text-xs text-neutral-500">
                [{h.agentId}] {h.conversationTitle} · {h.role}
                {h.timestamp ? ` · ${new Date(h.timestamp).toLocaleString()}` : ''}
              </div>
              <div className="text-sm" dangerouslySetInnerHTML={{ __html: highlight(h.snippet) }} />
            </button>
          ))}
        </div>
      )}

      <div className="space-y-2">
        {rows.map((c) => (
          <button
            key={c.id}
            onClick={() => showMessages(c)}
            className="flex w-full items-center justify-between rounded-lg border border-neutral-800 bg-neutral-900/40 p-3 text-left hover:border-neutral-600"
          >
            <div className="min-w-0">
              <div className="truncate text-sm">{c.title || '(untitled)'}</div>
              <div className="mt-0.5 truncate text-xs text-neutral-500" title={c.sourcePath ?? ''}>
                [{c.agentId}] {c.messageCount} 条消息 · 导入于{' '}
                {new Date(c.importedAt).toLocaleString()}
              </div>
            </div>
          </button>
        ))}
        {rows.length === 0 && (
          <div className="rounded-lg border border-dashed border-neutral-800 p-6 text-center text-sm text-neutral-500">
            还没有导入会话。点击右上角按钮开始。
          </div>
        )}
      </div>

      {open && (
        <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/60 p-8">
          <div className="flex max-h-[80vh] w-full max-w-3xl flex-col rounded-lg border border-neutral-700 bg-neutral-900">
            <div className="flex items-center justify-between border-b border-neutral-800 px-5 py-3">
              <div className="truncate text-sm font-medium">{open.title}</div>
              <button
                onClick={() => setOpen(null)}
                className="rounded bg-neutral-800 px-3 py-1 text-xs hover:bg-neutral-700"
              >
                关闭
              </button>
            </div>
            <div className="min-h-0 flex-1 space-y-3 overflow-auto p-4">
              {open.messages.map((m) => (
                <div key={m.id} className="rounded border border-neutral-800 p-3">
                  <div className="mb-1 text-xs text-neutral-500">
                    {m.role}
                    {m.timestamp ? ` · ${new Date(m.timestamp).toLocaleString()}` : ''}
                  </div>
                  <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-relaxed">
                    {m.content}
                  </pre>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function highlight(snippet: string): string {
  return snippet
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/\[/g, '<span class="text-amber-300">')
    .replace(/\]/g, '</span>')
}
