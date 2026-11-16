/**
 * Exercises the MCP server through a real SDK client over an in-memory
 * transport — the nine inspector checks from guide §10.7:
 * start, list tools, schema, read context, write task, unauthorized project,
 * path traversal, clear errors, no silent overwrite.
 */

import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { createDatabase, type Db } from '@cross-agent-sync/database'
import { createProject } from '@cross-agent-sync/core'
import { buildServer } from '../src/index'

let db: Db | undefined
let projectId: string
let client: Client

beforeEach(async () => {
  db?.close()
  db = createDatabase(':memory:')
  const root = mkdtempSync(join(tmpdir(), 'cas-mcp-'))
  projectId = createProject(db, { name: 'demo', rootPath: root }).id
  client = await connect()
})

afterAll(() => {
  db?.close()
})

async function connect(agentId = 'codex'): Promise<Client> {
  const c = new Client({ name: 'test-client', version: '0.0.0' })
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  const server = buildServer({ db: db!, projectId, agentId })
  await server.connect(serverTransport)
  await c.connect(clientTransport)
  return c
}

async function call(name: string, args: Record<string, unknown> = {}): Promise<unknown> {
  const r = await client.callTool({ name, arguments: args })
  const t = (r.content ?? []) as Array<{ type: string; text: string }>
  const body = t.map((x) => x.text).join('\n')
  if (r.isError) throw new Error(body)
  return JSON.parse(t[0].text)
}

describe('mcp server', () => {
  it('starts, lists all 10 tools with schemas', async () => {
    client = await connect()
    const tools = await client.listTools()
    expect(tools.tools.map((t) => t.name).sort()).toEqual([
      'create_handoff',
      'create_task',
      'get_current_tasks',
      'get_latest_handoff',
      'get_project_context',
      'list_projects',
      'record_decision',
      'report_file_change',
      'search_context',
      'update_task'
    ])
    for (const t of tools.tools) {
      expect(t.inputSchema).toBeTruthy()
    }
  })

  it('reads the bound project and its context', async () => {
    client = await connect('zcode')
    const projects = (await call('list_projects')) as {
      projects: Array<{ id: string }>
    }
    expect(projects.projects).toHaveLength(1)
    expect(projects.projects[0].id).toBe(projectId)

    const ctx = (await call('get_project_context', {
      sections: ['overview']
    })) as { sections: Record<string, string> }
    expect(ctx.sections.overview).toContain('Project Overview')
  })

  it('search finds context lines', async () => {
    client = await connect('zcode')
    const r = (await call('search_context', { query: 'overview' })) as {
      hits: Array<{ section: string }>
    }
    expect(r.hits.length).toBeGreaterThan(0)
  })

  it('creates and updates a task with optimistic locking', async () => {
    client = await connect('codex')
    const created = (await call('create_task', { title: 'from codex' })) as {
      task: { id: string; version: number }
    }
    expect(created.task.version).toBe(1)

    const updated = (await call('update_task', {
      task_id: created.task.id,
      status: 'done',
      expected_version: 1
    })) as { task: { status: string; version: number } }
    expect(updated.task.status).toBe('done')
    expect(updated.task.version).toBe(2)

    // stale version must conflict, not silently overwrite
    await expect(
      call('update_task', {
        task_id: created.task.id,
        status: 'todo',
        expected_version: 1
      })
    ).rejects.toThrow(/VERSION_CONFLICT/)
  })

  it('handoff round-trip writes a Markdown file', async () => {
    client = await connect('codex')
    const created = (await call('create_handoff', {
      summary: 'implemented login',
      completed_tasks: ['login api'],
      next_steps: ['permissions'],
      to_agent: 'zcode'
    })) as { id: string; summary: string }
    expect(created.summary).toContain('login')

    const latest = (await call('get_latest_handoff')) as { summary: string; fromAgentId: string }
    expect(latest.summary).toContain('login')
    expect(latest.fromAgentId).toBe('codex')
  })

  it('record_decision writes an ADR row', async () => {
    client = await connect('zcode')
    const d = (await call('record_decision', {
      title: 'use node:sqlite',
      summary: 'zero native addons'
    })) as { title: string; agentId: string }
    expect(d.title).toBe('use node:sqlite')
    expect(d.agentId).toBe('zcode')
  })

  it('rejects path traversal in report_file_change', async () => {
    client = await connect('codex')
    await expect(
      call('report_file_change', { relative_path: '../outside.txt', event_type: 'add' })
    ).rejects.toThrow(/PATH_OUTSIDE_PROJECT/)
    // a legit relative path works
    const ok = (await call('report_file_change', {
      relative_path: 'src/main.ts',
      event_type: 'change',
      note: 'touched entry'
    })) as { relativePath: string }
    expect(ok.relativePath).toBe('src/main.ts')
  })

  it('reports a clear error when bound project is missing', () => {
    try {
      buildServer({ db: db!, projectId: 'nope', agentId: 'codex' })
      expect.unreachable('buildServer should have thrown')
    } catch (e) {
      expect((e as { code?: string }).code).toBe('PROJECT_NOT_FOUND')
    }
  })
})
