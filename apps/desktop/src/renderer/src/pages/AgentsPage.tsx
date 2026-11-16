import { useEffect, useState } from 'react'
import type { ProjectRow } from '@cross-agent-sync/core'
import { api, ApiError, type AgentsStatus, type WritePlan } from '../lib/api'

interface PendingPlan {
  title: string
  plan: WritePlan
  hash: string
  /** null for the shared rules file */
  agentId: string | null
}

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export default function AgentsPage({ active }: { active: ProjectRow | null }): React.ReactElement {
  const [status, setStatus] = useState<AgentsStatus | null>(null)
  const [pending, setPending] = useState<PendingPlan | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!active) return
    let cancelled = false
    ;(async () => {
      try {
        const s = await api.agents.status(active.id)
        if (!cancelled) setStatus(s)
      } catch (e) {
        if (!cancelled) setMessage(String(e))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [active])

  if (!active) {
    return <div className="p-6 text-sm text-neutral-500">先在项目页选择或导入一个项目。</div>
  }

  const preview = async (title: string, plan: WritePlan, agentId: string | null): Promise<void> => {
    setPending({ title, plan, hash: await sha256Hex(plan.next), agentId })
  }

  const apply = async (): Promise<void> => {
    if (!pending) return
    try {
      const res =
        pending.agentId === null
          ? await api.agents.applyRules(active.id, pending.hash)
          : await api.agents.applyMcp(active.id, pending.agentId, pending.hash)
      setMessage(`已写入 ${res.target}${res.backupPath ? `（原文件备份：${res.backupPath}）` : ''}`)
      setPending(null)
      setStatus(await api.agents.status(active.id))
    } catch (e) {
      setMessage(e instanceof ApiError ? `${e.code}: ${e.message}` : String(e))
      setPending(null)
    }
  }

  return (
    <div className="p-6">
      <h1 className="mb-1 text-xl font-semibold">Agent 接入</h1>
      <p className="mb-5 text-xs text-neutral-500">
        让 ZCode 与 Codex 通过共享规则文件（AGENTS.md）和本地 MCP 服务器访问「{active.name}
        」的上下文。 所有写入都会先预览差异，原文件自动备份。
      </p>

      {message && (
        <div className="mb-4 rounded border border-neutral-700 bg-neutral-900/60 px-4 py-2 text-xs text-neutral-300">
          {message}
        </div>
      )}

      <button
        onClick={async () => {
          try {
            await preview(
              'AGENTS.md（ZCode 与 Codex 共用）',
              await api.agents.planRules(active.id),
              null
            )
          } catch (e) {
            setMessage(String(e))
          }
        }}
        className="mb-5 rounded bg-blue-600 px-4 py-2 text-sm font-medium hover:bg-blue-500"
      >
        生成 / 更新 AGENTS.md
      </button>

      <div className="space-y-3">
        {status?.agents.map((a) => (
          <div key={a.id} className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-4">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium">{a.displayName}</div>
              <div className="flex gap-2 text-xs">
                <Badge ok={a.installed} label={a.installed ? '已安装' : '未检测到'} />
                <Badge ok={a.rulesWritten} label={a.rulesWritten ? '规则已就绪' : '规则未写入'} />
                <Badge
                  ok={a.mcp.configured}
                  label={a.mcp.configured ? 'MCP 已配置' : 'MCP 未配置'}
                />
              </div>
            </div>
            <div className="mt-2 text-xs text-neutral-500">
              MCP 配置文件：{a.mcp.path}
              {a.mcp.shadowed && (
                <span className="ml-1 text-amber-400">
                  ⚠ 用户级配置存在同名服务器，会覆盖项目级：{a.mcp.shadowedBy}
                </span>
              )}
            </div>
            <button
              disabled={!a.installed}
              onClick={async () => {
                try {
                  await preview(
                    `${a.displayName} MCP 配置`,
                    await api.agents.planMcp(active.id, a.id),
                    a.id
                  )
                } catch (e) {
                  setMessage(String(e))
                }
              }}
              className="mt-3 rounded bg-neutral-800 px-3 py-1.5 text-xs hover:bg-neutral-700 disabled:opacity-40"
            >
              配置 {a.displayName} 的 MCP
            </button>
          </div>
        ))}
      </div>

      {pending && (
        <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/60 p-8">
          <div className="flex max-h-[80vh] w-full max-w-3xl flex-col rounded-lg border border-neutral-700 bg-neutral-900">
            <div className="border-b border-neutral-800 px-5 py-3">
              <div className="text-sm font-medium">确认写入：{pending.title}</div>
              <div className="mt-0.5 text-xs text-neutral-500">
                目标 {pending.plan.target} · +{pending.plan.preview.added} / -
                {pending.plan.preview.removed} 行
                {pending.plan.backupPath ? ' · 将先备份原文件' : ' · 新文件'}
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-auto p-4">
              <DiffView current={pending.plan.current} next={pending.plan.next} />
            </div>
            <div className="flex justify-end gap-2 border-t border-neutral-800 px-5 py-3">
              <button
                onClick={() => setPending(null)}
                className="rounded bg-neutral-800 px-4 py-2 text-sm hover:bg-neutral-700"
              >
                取消
              </button>
              <button
                onClick={apply}
                className="rounded bg-blue-600 px-4 py-2 text-sm font-medium hover:bg-blue-500"
              >
                确认写入
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Badge({ ok, label }: { ok: boolean; label: string }): React.ReactElement {
  return (
    <span
      className={`rounded px-2 py-0.5 ${
        ok ? 'bg-emerald-950 text-emerald-300' : 'bg-neutral-800 text-neutral-400'
      }`}
    >
      {label}
    </span>
  )
}

function DiffView({ current, next }: { current: string | null; next: string }): React.ReactElement {
  const cur = new Set((current ?? '').split('\n'))
  const nxt = new Set(next.split('\n'))
  return (
    <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed">
      {current !== null &&
        current
          .split('\n')
          .filter((l) => !nxt.has(l))
          .map((l, i) => (
            <div key={`d${i}`} className="text-red-400">
              - {l}
            </div>
          ))}
      {next
        .split('\n')
        .filter((l) => !cur.has(l))
        .map((l, i) => (
          <div key={`a${i}`} className="text-emerald-400">
            + {l}
          </div>
        ))}
    </pre>
  )
}
