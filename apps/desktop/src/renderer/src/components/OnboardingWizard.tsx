import { useState } from 'react'
import { api, ApiError, type AgentsStatus } from '../lib/api'

const STEPS = ['欢迎', '选择项目', '接入 Agent', '完成']

/**
 * First-run wizard: pick a project → scaffold → connect agents → done.
 * Shown only when no project is managed yet (and not in E2E runs).
 */
export default function OnboardingWizard({ onDone }: { onDone: () => void }): React.ReactElement {
  const [step, setStep] = useState(0)
  const [name, setName] = useState('')
  const [rootPath, setRootPath] = useState('')
  const [template, setTemplate] = useState<'default' | 'frontend' | 'backend' | 'research'>(
    'default'
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [projectId, setProjectId] = useState<string | null>(null)
  const [agentStatus, setAgentStatus] = useState<AgentsStatus | null>(null)
  const [results, setResults] = useState<string[]>([])

  const pick = async (): Promise<void> => {
    const dir = await api.dialog.pickDirectory()
    if (dir) {
      setRootPath(dir)
      if (!name) setName(dir.split(/[\\/]/).pop() || '')
    }
  }

  const createProject = async (): Promise<void> => {
    if (!name.trim() || !rootPath.trim()) return
    setBusy(true)
    setError(null)
    try {
      const p = await api.projects.create({
        name,
        rootPath,
        template
      })
      setProjectId(p.id)
      setAgentStatus(await api.agents.status(p.id))
      setStep(2)
    } catch (e) {
      setError(e instanceof ApiError ? `${e.code}: ${e.message}` : String(e))
    } finally {
      setBusy(false)
    }
  }

  const configureAgent = async (agentId: string): Promise<void> => {
    if (!projectId) return
    try {
      // shared rules file once + this agent's MCP config
      const rules = await api.agents.planRules(projectId)
      await api.agents.applyRules(projectId, await sha(rules.next))
      const plan = await api.agents.planMcp(projectId, agentId)
      await api.agents.applyMcp(projectId, agentId, await sha(plan.next))
      setResults((r) => [...r, `${agentId}：AGENTS.md + MCP 已写入`])
      setAgentStatus(await api.agents.status(projectId))
    } catch (e) {
      setResults((r) => [
        ...r,
        `${agentId}：失败 — ${e instanceof ApiError ? e.message : String(e)}`
      ])
    }
  }

  const finish = async (): Promise<void> => {
    localStorage.setItem('cas.onboardingDone', '1')
    onDone()
  }

  return (
    <div className="flex h-full items-center justify-center bg-neutral-950 p-8">
      <div className="w-full max-w-xl rounded-2xl border border-neutral-800 bg-neutral-900/70 p-8 shadow-2xl">
        {/* progress */}
        <div className="mb-6 flex items-center gap-2">
          {STEPS.map((s, i) => (
            <div key={s} className="flex flex-1 items-center gap-2">
              <div
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                  i < step
                    ? 'bg-emerald-600 text-white'
                    : i === step
                      ? 'bg-blue-600 text-white'
                      : 'bg-neutral-800 text-neutral-500'
                }`}
              >
                {i < step ? '✓' : i + 1}
              </div>
              <span className={`text-xs ${i === step ? 'text-neutral-200' : 'text-neutral-500'}`}>
                {s}
              </span>
              {i < STEPS.length - 1 && <div className="h-px flex-1 bg-neutral-800" />}
            </div>
          ))}
        </div>

        {step === 0 && (
          <div>
            <h1 className="mb-2 text-2xl font-bold">让 ZCode 和 Codex 共享同一个项目记忆</h1>
            <p className="mb-6 text-sm leading-relaxed text-neutral-400">
              Cross-Agent Sync 在你的项目里维护一份所有 Agent 都能读写的共享上下文： 在 Codex
              里做完的事，ZCode 打开就能接着干。
            </p>
            <ul className="mb-8 space-y-2 text-sm text-neutral-300">
              <li className="flex gap-2">
                <span className="text-emerald-400">✓</span> 共享上下文：概览 / 架构 / 进度 / 规范 /
                决策 / 交接
              </li>
              <li className="flex gap-2">
                <span className="text-emerald-400">✓</span> 本地 MCP 服务器：Agent
                用标准工具直接读写
              </li>
              <li className="flex gap-2">
                <span className="text-emerald-400">✓</span>{' '}
                历史会话导入与全文搜索（只读，不动源数据）
              </li>
            </ul>
            <button
              onClick={() => setStep(1)}
              className="w-full rounded-lg bg-blue-600 py-3 text-sm font-semibold hover:bg-blue-500"
            >
              开始 —— 只要 1 分钟
            </button>
          </div>
        )}

        {step === 1 && (
          <div>
            <h2 className="mb-1 text-lg font-semibold">选择你的项目目录</h2>
            <p className="mb-5 text-xs text-neutral-500">
              一个正在用（或打算用）ZCode / Codex 开发的本地目录。会在里面生成 .agent-sync/
              共享上下文。
            </p>
            <div className="mb-3 flex gap-2">
              <input
                value={rootPath}
                onChange={(e) => setRootPath(e.target.value)}
                placeholder="点右侧浏览选择…"
                className="min-w-0 flex-1 rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm outline-none focus:border-neutral-500"
                readOnly
              />
              <button
                onClick={pick}
                className="shrink-0 rounded bg-neutral-800 px-4 text-sm hover:bg-neutral-700"
              >
                浏览…
              </button>
            </div>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="项目名称"
              className="mb-3 w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm outline-none focus:border-neutral-500"
            />
            <select
              value={template}
              onChange={(e) =>
                setTemplate(e.target.value as 'default' | 'frontend' | 'backend' | 'research')
              }
              className="mb-4 w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm outline-none focus:border-neutral-500"
            >
              <option value="default">模板：通用</option>
              <option value="frontend">模板：前端项目</option>
              <option value="backend">模板：后端项目</option>
              <option value="research">模板：研究 / 实验</option>
            </select>
            {error && <div className="mb-3 text-xs text-red-400">{error}</div>}
            <div className="flex gap-2">
              <button
                onClick={() => setStep(0)}
                className="rounded bg-neutral-800 px-4 py-2 text-sm hover:bg-neutral-700"
              >
                上一步
              </button>
              <button
                onClick={createProject}
                disabled={busy || !name.trim() || !rootPath.trim()}
                className="flex-1 rounded-lg bg-blue-600 py-2 text-sm font-semibold hover:bg-blue-500 disabled:opacity-40"
              >
                {busy ? '创建中…' : '创建项目并继续'}
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div>
            <h2 className="mb-1 text-lg font-semibold">接入 Agent</h2>
            <p className="mb-5 text-xs text-neutral-500">
              为检测到的 Agent 生成共享规则（AGENTS.md）和 MCP 配置。每一步都可以之后在「Agent
              接入」页单独重做。
            </p>
            <div className="mb-4 space-y-2">
              {agentStatus?.agents.map((a) => {
                const done = results.some((r) => r.startsWith(a.id) && r.includes('已写入'))
                return (
                  <div
                    key={a.id}
                    className="flex items-center justify-between rounded border border-neutral-800 bg-neutral-950/60 px-4 py-3"
                  >
                    <div>
                      <div className="text-sm font-medium">{a.displayName}</div>
                      <div className="text-xs text-neutral-500">
                        {a.installed ? '已检测到' : '未检测到安装'}
                      </div>
                    </div>
                    {done ? (
                      <span className="text-xs text-emerald-400">✓ 已接入</span>
                    ) : (
                      <button
                        disabled={!a.installed}
                        onClick={() => configureAgent(a.id)}
                        className="rounded bg-blue-600 px-3 py-1.5 text-xs font-medium hover:bg-blue-500 disabled:opacity-40"
                      >
                        一键接入
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
            {results.length > 0 && (
              <div className="mb-4 space-y-1 rounded border border-neutral-800 bg-neutral-950/60 p-3 text-xs text-neutral-400">
                {results.map((r, i) => (
                  <div key={i}>{r}</div>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <button
                onClick={() => setStep(1)}
                className="rounded bg-neutral-800 px-4 py-2 text-sm hover:bg-neutral-700"
              >
                上一步
              </button>
              <button
                onClick={() => setStep(3)}
                className="flex-1 rounded-lg bg-blue-600 py-2 text-sm font-semibold hover:bg-blue-500"
              >
                下一步
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="text-center">
            <div className="mb-3 text-4xl">🎉</div>
            <h2 className="mb-2 text-xl font-bold">一切就绪！</h2>
            <p className="mx-auto mb-6 max-w-md text-sm leading-relaxed text-neutral-400">
              在项目目录里<strong className="text-neutral-200">新开一个 ZCode 或 Codex 会话</strong>
              ，它们就能通过 cross-agent-sync 的 MCP 工具读写共享上下文了。
              试试对它说：「读取项目交接，然后继续」。
            </p>
            <div className="mb-6 space-y-2 text-left text-xs text-neutral-500">
              <div>• 「会话」页：导入并全文搜索两边的本地历史会话</div>
              <div>• 「设置」页：数据备份 / 恢复 / 健康自检</div>
              <div>• 建议：把项目里的 .agent-sync/ 目录提交进 Git</div>
            </div>
            <button
              onClick={finish}
              className="w-full rounded-lg bg-emerald-600 py-3 text-sm font-semibold hover:bg-emerald-500"
            >
              进入应用
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

async function sha(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}
