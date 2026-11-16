/**
 * Project lifecycle (guide §7.2, §14.3). Creating/importing a project
 * scaffolds `.agent-sync/` inside the user's directory and indexes the
 * context docs. Removing a project only un-manages it — the user's source
 * tree is never touched.
 */

import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { SELECTS, type Db, type ProjectRow } from '@cross-agent-sync/database'
import { appError, nowIso } from '@cross-agent-sync/shared'
import { hashText } from './hash'
import { logAudit } from './audit'
import {
  APP_DIR_NAME,
  DECISIONS_DIR,
  HANDOFFS_DIR,
  TASKS_FILE,
  initialTasksJson,
  manifestJson,
  templatesFor,
  type TemplateId
} from './templates'

export type { ProjectRow }
export interface CreateProjectInput {
  name: string
  rootPath: string
  description?: string
  template?: TemplateId
}

export function createProject(db: Db, input: CreateProjectInput): ProjectRow {
  const name = input.name.trim()
  const rootPath = input.rootPath.trim()
  if (!name) throw appError('INVALID_INPUT', 'project name is required')
  if (!rootPath) throw appError('INVALID_INPUT', 'rootPath is required')
  if (!existsSync(rootPath) || !statSync(rootPath).isDirectory()) {
    throw appError('PATH_OUTSIDE_PROJECT', `not a directory: ${rootPath}`)
  }

  const id = randomUUID()
  const now = nowIso()
  const appDir = join(rootPath, APP_DIR_NAME)
  const templates = templatesFor(input.template ?? 'default')

  // Scaffold only what's missing — re-importing an existing .agent-sync
  // adopts its files instead of overwriting (guide §3.4).
  const created = scaffoldAgentSync(appDir, templates, {
    projectId: id,
    projectName: name,
    createdAt: now,
    updatedAt: now
  })

  db.transaction(() => {
    db.run(
      'INSERT INTO projects (id, name, root_path, description, created_at, updated_at) ' +
        'VALUES (?, ?, ?, ?, ?, ?)',
      [id, name, rootPath, input.description?.trim() || null, now, now]
    )
    for (const t of templates) {
      const abs = join(appDir, t.relativePath)
      const body = existsSync(abs) ? readFileSync(abs, 'utf8') : t.body
      db.run(
        'INSERT INTO contexts (id, project_id, context_type, title, relative_path, version, content_hash, updated_at) ' +
          'VALUES (?, ?, ?, ?, ?, 1, ?, ?)',
        [randomUUID(), id, t.type, t.title, t.relativePath, hashText(body), now]
      )
    }
  })

  logAudit(db, {
    projectId: id,
    actorType: 'user',
    action: 'project.created',
    targetType: 'project',
    targetId: id,
    details: { rootPath, scaffolded: created.length, template: input.template ?? 'default' }
  })

  return getProject(db, id)
}

function scaffoldAgentSync(
  appDir: string,
  templates: ReturnType<typeof templatesFor>,
  meta: { projectId: string; projectName: string; createdAt: string; updatedAt: string }
): string[] {
  const created: string[] = []
  const ensure = (abs: string, content: string): void => {
    if (existsSync(abs)) return
    mkdirSync(dirname(abs), { recursive: true })
    writeFileSync(abs, content, 'utf8')
    created.push(abs)
  }
  ensure(join(appDir, 'manifest.json'), manifestJson(meta))
  for (const t of templates) {
    ensure(join(appDir, t.relativePath), t.body)
  }
  ensure(join(appDir, TASKS_FILE), initialTasksJson())
  ensure(join(appDir, DECISIONS_DIR, '.gitkeep'), '')
  ensure(join(appDir, HANDOFFS_DIR, '.gitkeep'), '')
  return created
}

export function listProjects(db: Db): ProjectRow[] {
  return db.all<ProjectRow>(`${SELECTS.project} ORDER BY updated_at DESC`)
}

export function getProject(db: Db, id: string): ProjectRow {
  const row = db.get<ProjectRow>(`${SELECTS.project} WHERE id = ?`, [id])
  if (!row) throw appError('PROJECT_NOT_FOUND', `no project ${id}`)
  return row
}

/** Read a project's root path without throwing when it is missing. */
function projectRoot(db: Db, projectId: string): string {
  const row = db.get<{ rootPath: string }>(
    'SELECT root_path AS "rootPath" FROM projects WHERE id = ?',
    [projectId]
  )
  if (!row) throw appError('PROJECT_NOT_FOUND', `no project ${projectId}`)
  return row.rootPath
}
export { projectRoot }

/** Un-manage a project: delete DB rows only; files on disk stay. */
export function removeProject(db: Db, id: string): void {
  getProject(db, id)
  db.transaction(() => {
    for (const table of [
      'contexts',
      'tasks',
      'handoffs',
      'decisions',
      'project_agents'
    ]) {
      db.run(`DELETE FROM ${table} WHERE project_id = ?`, [id])
    }
    db.run('DELETE FROM projects WHERE id = ?', [id])
  })
  logAudit(db, {
    projectId: id,
    actorType: 'user',
    action: 'project.removed',
    targetType: 'project',
    targetId: id
  })
}
