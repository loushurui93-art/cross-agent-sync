import { useCallback, useEffect, useState } from 'react'
import type { ProjectRow } from '@cross-agent-sync/core'
import { api } from './lib/api'
import DashboardPage from './pages/DashboardPage'
import ProjectsPage from './pages/ProjectsPage'
import ContextPage from './pages/ContextPage'
import TasksPage from './pages/TasksPage'
import AgentsPage from './pages/AgentsPage'

type Page = 'dashboard' | 'projects' | 'context' | 'tasks' | 'agents'

const NAV: Array<{ id: Page; label: string; icon: string }> = [
  { id: 'dashboard', label: '仪表盘', icon: '⌂' },
  { id: 'projects', label: '项目', icon: '▤' },
  { id: 'context', label: '上下文', icon: '✎' },
  { id: 'tasks', label: '任务', icon: '☑' },
  { id: 'agents', label: 'Agent 接入', icon: '⚡' }
]

const ACTIVE_PROJECT_KEY = 'cas.activeProject'

export default function App(): React.ReactElement {
  const [page, setPage] = useState<Page>('dashboard')
  const [projects, setProjects] = useState<ProjectRow[]>([])
  const [activeId, setActiveId] = useState<string | null>(() =>
    localStorage.getItem(ACTIVE_PROJECT_KEY)
  )
  const [error, setError] = useState<string | null>(null)

  const refreshProjects = useCallback(async (): Promise<void> => {
    try {
      const list = await api.projects.list()
      setProjects(list)
      setError(null)
      if (list.length === 0) {
        setActiveId(null)
        localStorage.removeItem(ACTIVE_PROJECT_KEY)
      } else if (!list.some((p) => p.id === activeId)) {
        setActiveId(list[0].id)
        localStorage.setItem(ACTIVE_PROJECT_KEY, list[0].id)
      }
    } catch (e) {
      setError(String(e))
    }
    // activeId intentionally not a dependency: refresh uses latest via closure
  }, [activeId])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const list = await api.projects.list()
        if (cancelled) return
        setProjects(list)
        setError(null)
        if (list.length === 0) {
          setActiveId(null)
          localStorage.removeItem(ACTIVE_PROJECT_KEY)
        } else if (!list.some((p) => p.id === activeId)) {
          setActiveId(list[0].id)
          localStorage.setItem(ACTIVE_PROJECT_KEY, list[0].id)
        }
      } catch (e) {
        if (!cancelled) setError(String(e))
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const active = projects.find((p) => p.id === activeId) ?? null
  const selectProject = (id: string): void => {
    setActiveId(id)
    localStorage.setItem(ACTIVE_PROJECT_KEY, id)
  }

  return (
    <div className="flex h-full">
      <aside className="flex w-52 shrink-0 flex-col border-r border-neutral-800 bg-neutral-900/60">
        <div className="border-b border-neutral-800 px-4 py-4">
          <div className="text-sm font-semibold tracking-wide">Cross-Agent Sync</div>
          <div className="mt-0.5 text-xs text-neutral-500">共享工作空间</div>
        </div>
        <nav className="flex-1 p-2">
          {NAV.map((n) => (
            <button
              key={n.id}
              onClick={() => setPage(n.id)}
              className={`mb-1 flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm ${
                page === n.id
                  ? 'bg-neutral-800 text-white'
                  : 'text-neutral-400 hover:bg-neutral-800/50 hover:text-neutral-200'
              }`}
            >
              <span className="w-4 text-center opacity-70">{n.icon}</span>
              {n.label}
            </button>
          ))}
        </nav>
        <div className="border-t border-neutral-800 px-4 py-3 text-xs text-neutral-500">
          {active ? (
            <>
              <div className="mb-1 font-medium text-neutral-300">{active.name}</div>
              <div className="truncate" title={active.rootPath}>
                {active.rootPath}
              </div>
            </>
          ) : (
            '未选择项目'
          )}
        </div>
      </aside>

      <main className="flex-1 overflow-auto">
        {error && (
          <div className="m-4 rounded border border-red-800 bg-red-950/50 px-4 py-2 text-sm text-red-300">
            {error}
          </div>
        )}
        {page === 'dashboard' && <DashboardPage active={active} projects={projects} go={setPage} />}
        {page === 'projects' && (
          <ProjectsPage
            projects={projects}
            activeId={activeId}
            onChanged={refreshProjects}
            onSelect={selectProject}
          />
        )}
        {page === 'context' && <ContextPage active={active} />}
        {page === 'tasks' && <TasksPage active={active} />}
        {page === 'agents' && <AgentsPage active={active} />}
      </main>
    </div>
  )
}
