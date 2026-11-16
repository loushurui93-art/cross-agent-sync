import { useCallback, useEffect, useRef, useState } from 'react'
import type { ContextDoc, ProjectRow } from '@cross-agent-sync/core'
import type { ContextType } from '@cross-agent-sync/shared'
import { api, ApiError } from '../lib/api'

const LABELS: Record<ContextType, string> = {
  overview: '项目概览',
  architecture: '架构',
  'development-state': '开发状态',
  rules: '开发规范',
  decision: '决策',
  handoff: '交接'
}
const EDITABLE: ContextType[] = ['overview', 'architecture', 'development-state', 'rules']

type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'conflict'

export default function ContextPage({ active }: { active: ProjectRow | null }): React.ReactElement {
  const [type, setType] = useState<ContextType>('overview')
  const [doc, setDoc] = useState<ContextDoc | null>(null)
  const [content, setContent] = useState('')
  const [state, setState] = useState<SaveState>('idle')
  const [message, setMessage] = useState<string | null>(null)
  /** one-shot flag: next save overrides the external-change guard */
  const forceSaveRef = useRef(false)

  const load = useCallback(
    async (t: ContextType): Promise<void> => {
      if (!active) return
      try {
        const d = await api.context.get(active.id, t)
        setDoc(d)
        setContent(d.content)
        setState('idle')
        setMessage(null)
      } catch (e) {
        setMessage(String(e))
      }
    },
    [active]
  )

  useEffect(() => {
    if (!active) return
    let cancelled = false
    ;(async () => {
      try {
        const d = await api.context.get(active.id, type)
        if (cancelled) return
        setDoc(d)
        setContent(d.content)
        setState('idle')
        setMessage(null)
      } catch (e) {
        if (!cancelled) setMessage(String(e))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [active, type])

  if (!active) {
    return <Empty />
  }

  const dirty = content !== (doc?.content ?? '')

  const save = async (): Promise<void> => {
    if (!doc) return
    setState('saving')
    try {
      const d = await api.context.save({
        projectId: active.id,
        type,
        content,
        expectedVersion: doc.version,
        force: forceSaveRef.current
      })
      forceSaveRef.current = false
      setDoc(d)
      setState('saved')
      setMessage(null)
    } catch (e) {
      if (e instanceof ApiError && e.code === 'VERSION_CONFLICT') {
        setState('conflict')
        setMessage(
          '文件在应用外部被修改过。选择「保留外部修改」重新加载，或「保留我的编辑」强制覆盖。'
        )
      } else {
        setState('dirty')
        setMessage(String(e))
      }
    }
  }

  const reload = async (): Promise<void> => {
    forceSaveRef.current = false
    await load(type)
  }

  /** Keep my edits: force-save over the external version. */
  const forceSave = async (): Promise<void> => {
    forceSaveRef.current = true
    await save()
  }

  return (
    <div className="flex h-full flex-col p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">上下文</h1>
        <div className="text-xs text-neutral-500">
          {doc ? `v${doc.version} · ${doc.relativePath}` : ''}
        </div>
      </div>

      <div className="mb-3 flex gap-1">
        {EDITABLE.map((t) => (
          <button
            key={t}
            onClick={() => setType(t)}
            className={`rounded-t px-3 py-1.5 text-sm ${
              type === t ? 'bg-neutral-800 text-white' : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            {LABELS[t]}
          </button>
        ))}
      </div>

      <textarea
        value={content}
        onChange={(e) => {
          setContent(e.target.value)
          setState('dirty')
        }}
        spellCheck={false}
        className="min-h-0 flex-1 resize-none rounded-lg border border-neutral-800 bg-neutral-900 p-4 font-mono text-sm leading-relaxed outline-none focus:border-neutral-600"
      />

      <div className="mt-3 flex items-center gap-3">
        <button
          onClick={save}
          disabled={!dirty || state === 'saving'}
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium hover:bg-blue-500 disabled:opacity-40"
        >
          {state === 'saving' ? '保存中…' : '保存'}
        </button>
        <button
          onClick={reload}
          className="rounded bg-neutral-800 px-4 py-2 text-sm hover:bg-neutral-700"
        >
          {state === 'conflict' ? '保留外部修改（重新加载）' : '重新加载'}
        </button>
        {state === 'conflict' && (
          <button
            onClick={forceSave}
            className="rounded bg-amber-600 px-4 py-2 text-sm font-medium hover:bg-amber-500"
          >
            保留我的编辑（覆盖外部）
          </button>
        )}
        <span className="text-xs text-neutral-500">
          {state === 'saved' && '已保存'}
          {state === 'dirty' && '有未保存修改'}
          {state === 'conflict' && '检测到冲突'}
        </span>
        {message && <span className="text-xs text-red-400">{message}</span>}
      </div>
    </div>
  )
}

function Empty(): React.ReactElement {
  return <div className="p-6 text-sm text-neutral-500">先在项目页选择或导入一个项目。</div>
}
