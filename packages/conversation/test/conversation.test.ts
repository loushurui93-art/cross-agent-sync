import { beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { createDatabase, type Db } from '@cross-agent-sync/database'
import { createProject } from '@cross-agent-sync/core'
import {
  importConversation,
  importProjectConversations,
  listConversations,
  listMessages,
  loadClaudeSession,
  loadCodexThread,
  loadZcodeSession,
  searchMessages
} from '../src'

let db: Db
let projectDir: string
let projectId: string

beforeEach(() => {
  db?.close()
  db = createDatabase(':memory:')
  projectDir = mkdtempSync(join(tmpdir(), 'cas-conv-'))
  projectId = createProject(db, { name: 'demo', rootPath: projectDir }).id
})

// ---------------------------------------------------------------- fixtures

function seedZcodeDb(path: string, cwd: string): string {
  const s = new DatabaseSync(path)
  s.exec(
    `CREATE TABLE session (id text primary key, project_id text not null, workspace_id text,
       parent_id text, slug text not null, directory text not null, path text, title text not null,
       version text not null, share_url text, time_created integer not null, time_updated integer not null,
       time_archived integer, task_type text default 'interactive', title_source text default 'first_input',
       time_deleted integer, last_outcome text);
     CREATE TABLE message (id text primary key, session_id text not null, time_created integer not null,
       time_updated integer not null, data text not null, sequence integer);
     CREATE TABLE part (id text primary key, message_id text not null, session_id text not null,
       time_created integer not null, time_updated integer not null, data text not null, sequence integer);`
  )
  const sid = 'sess_fix_0001'
  s.prepare(
    'INSERT INTO session (id, project_id, slug, directory, path, title, version, time_created, time_updated) ' +
      "VALUES (?, 'p', 's', ?, ?, '修复登录超时', '3.18', 1760000000000, 1760000100000)"
  ).run(sid, cwd, cwd)
  const msg = (id: string, data: unknown, seq: number): void => {
    s.prepare(
      'INSERT INTO message (id, session_id, time_created, time_updated, data, sequence) VALUES (?, ?, 1760000001000, 1760000001000, ?, ?)'
    ).run(id, sid, JSON.stringify(data), seq)
  }
  const part = (id: string, mid: string, data: unknown, seq: number): void => {
    s.prepare(
      'INSERT INTO part (id, message_id, session_id, time_created, time_updated, data, sequence) VALUES (?, ?, ?, 1760000001000, 1760000001000, ?, ?)'
    ).run(id, mid, sid, JSON.stringify(data), seq)
  }

  // genuine user prompt
  msg('m1', { role: 'user', semantics: { origin: 'real_user', kind: 'user_prompt' } }, 0)
  part('p1', 'm1', { type: 'text', text: '帮我修复登录超时问题' }, 0)
  // injected system reminder — must be filtered out
  msg('m2', { role: 'user', synthetic: true, semantics: { origin: 'agent_runtime' } }, 1)
  part('p2', 'm2', { type: 'text', text: 'system reminder' }, 0)
  // assistant with tool + text
  msg('m3', { role: 'assistant', modelId: 'GLM-5.3' }, 2)
  part('p3', 'm3', { type: 'tool', callID: 'c1', tool: 'Bash', state: { status: 'completed', input: { command: 'npm test' }, output: '2 passed' } }, 0)
  part('p4', 'm3', { type: 'text', text: '测试全部通过，问题已修复。' }, 1)
  s.close()
  return sid
}

function writeCodexRollout(dir: string, cwd: string): string {
  const ymd = join(dir, '2026', '11', '16')
  mkdirSync(ymd, { recursive: true })
  const id = '0123456789abcdef0123456789abcdef'
  const path = join(ymd, `rollout-2026-11-16T10-00-00-${id}.jsonl`)
  const lines = [
    { timestamp: '2026-11-16T10:00:00.000Z', type: 'session_meta', payload: { id, cwd, cli_version: '0.159.2' } },
    { timestamp: '2026-11-16T10:00:01.000Z', type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'add a retry policy' }] } },
    { timestamp: '2026-11-16T10:00:02.000Z', type: 'response_item', payload: { type: 'function_call', call_id: 'call_x', name: 'exec', arguments: '{"command":"ls"}' } },
    { timestamp: '2026-11-16T10:00:03.000Z', type: 'response_item', payload: { type: 'function_call_output', call_id: 'call_x', output: [{ type: 'input_text', text: 'src/' }] } },
    { timestamp: '2026-11-16T10:00:04.000Z', type: 'response_item', payload: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Added retry with backoff.' }] } }
  ]
  writeFileSync(path, lines.map((l) => JSON.stringify(l)).join('\n') + '\n', 'utf8')
  return path
}

// ---------------------------------------------------------------- tests

describe('zcode source', () => {
  it('filters injected messages and keeps tool summaries', () => {
    const sid = seedZcodeDb(join(projectDir, 'zcode.db'), projectDir)
    const conv = loadZcodeSession(join(projectDir, 'zcode.db'), sid)
    expect(conv.title).toContain('登录超时')
    expect(conv.messages).toHaveLength(2) // m2 filtered
    expect(conv.messages[0]!.parts![0]!.text).toContain('修复登录超时')
    const tool = conv.messages[1]!.parts!.find((p) => p.type === 'tool-call')
    expect(tool?.text).toContain('npm test')
  })
})

describe('claude source', () => {
  it('skips sidechains and thinking blocks, keeps text + tool pairs', () => {
    const dir = join(projectDir, 'claude-proj')
    const encoded = 'C--Users-LSR-Desktop-test'
    mkdirSync(join(projectDir, '.claude-home', 'projects', encoded), { recursive: true })
    const path = join(projectDir, '.claude-home', 'projects', encoded, 'abc123.jsonl')
    const cwd = 'C:\\Users\\LSR\\Desktop\\test'
    const lines = [
      { type: 'ai-title', title: '修 bug', sessionId: 'abc123' },
      {
        type: 'user',
        cwd,
        timestamp: '2026-11-17T01:00:00.000Z',
        message: { role: 'user', content: 'why is login failing' }
      },
      { type: 'mode', mode: 'normal' },
      {
        type: 'assistant',
        isSidechain: true,
        message: { role: 'assistant', content: [{ type: 'text', text: 'internal sidechain noise' }] }
      },
      {
        type: 'assistant',
        timestamp: '2026-11-17T01:00:05.000Z',
        message: {
          role: 'assistant',
          content: [
            { type: 'thinking', thinking: 'hidden reasoning' },
            { type: 'tool_use', name: 'Bash', input: { command: 'grep -rn login src' } },
            { type: 'text', text: 'Found the null check bug.' }
          ]
        }
      },
      {
        type: 'user',
        cwd,
        message: { role: 'user', content: [{ type: 'tool_result', content: 'src/login.ts:1' }] }
      }
    ]
    writeFileSync(path, lines.map((l) => JSON.stringify(l)).join('\n') + '\n', 'utf8')

    const conv = loadClaudeSession(path)
    expect(conv.title).toBe('修 bug')
    // sidechain skipped; tool_result folds into the assistant turn context
    expect(conv.messages.length).toBeGreaterThanOrEqual(2)
    expect(conv.messages[0]!.parts![0]!.text).toContain('login failing')
    const all = conv.messages.flatMap((m) => m.parts ?? [])
    expect(all.some((p) => p.text?.includes('Bash'))).toBe(true)
    expect(all.some((p) => p.text?.includes('null check'))).toBe(true)
    expect(all.every((p) => !p.text?.includes('hidden reasoning'))).toBe(true)
    expect(all.every((p) => !p.text?.includes('sidechain noise'))).toBe(true)
  })
})

describe('codex source', () => {
  it('pairs tool calls with outputs and orders turns', () => {
    const path = writeCodexRollout(projectDir, projectDir)
    const conv = loadCodexThread(path)
    expect(conv.messages).toHaveLength(2) // user + assistant(with tool result)
    expect(conv.messages[0]!.parts![0]!.text).toContain('retry policy')
    const toolResult = conv.messages[1]!.parts!.find((p) => p.type === 'tool-result')
    expect(toolResult?.text).toContain('exec')
    expect(conv.messages[1]!.parts!.some((p) => p.text?.includes('backoff'))).toBe(true)
  })
})

describe('import + dedup + search', () => {
  it('imports once, skips duplicates, and FTS finds content', () => {
    const sid = seedZcodeDb(join(projectDir, 'zcode.db'), projectDir)
    const conv = loadZcodeSession(join(projectDir, 'zcode.db'), sid)

    const r1 = importConversation(db, projectId, 'zcode', conv)
    expect(r1.imported).toBe(true)

    const r2 = importConversation(db, projectId, 'zcode', conv)
    expect(r2.imported).toBe(false)
    expect(r2.reason).toBe('already-imported')

    const rows = listConversations(db, projectId)
    expect(rows).toHaveLength(1)
    expect(rows[0].messageCount).toBe(2)
    expect(rows[0].agentId).toBe('zcode')

    const hits = searchMessages(db, { query: '登录超时' })
    expect(hits.length).toBeGreaterThan(0)
    expect(hits[0].agentId).toBe('zcode')
    expect(hits[0].snippet).toBeTruthy()

    const none = searchMessages(db, { query: 'zzz_no_such_word' })
    expect(none).toHaveLength(0)

    const msgs = listMessages(db, rows[0].id)
    expect(msgs.map((m) => m.role)).toEqual(['user', 'assistant'])
  })
})

describe('project import orchestration', () => {
  it('picks only sessions whose cwd belongs to the project', () => {
    const zhome = mkdtempSync(join(tmpdir(), 'cas-zhome-'))
    mkdirSync(join(zhome, 'cli', 'db'), { recursive: true })
    seedZcodeDb(join(zhome, 'cli', 'db', 'db.sqlite'), projectDir) // matches
    seedOtherCwd(zhome)

    const chome = mkdtempSync(join(tmpdir(), 'cas-chome-'))
    writeCodexRolloutIn(chome, projectDir) // matches
    writeCodexRolloutIn(chome, 'D:/elsewhere') // must be filtered out

    const summary = importProjectConversations(
      db,
      { id: projectId, rootPath: projectDir },
      { zcodeHome: zhome, codexHome: chome }
    )
    expect(summary.found.zcode).toBe(1)
    expect(summary.found.codex).toBe(1)
    expect(summary.zcode.imported).toBe(1)
    expect(summary.codex.imported).toBe(1)

    const all = listConversations(db, projectId)
    expect(all).toHaveLength(2)
    expect(new Set(all.map((c) => c.agentId))).toEqual(new Set(['zcode', 'codex']))
  })
})

function seedOtherCwd(zhome: string): void {
  // second session in a different cwd — must be ignored by project import
  const s = new DatabaseSync(join(zhome, 'cli', 'db', 'db.sqlite'))
  const sid = 'sess_other_02'
  s.prepare(
    'INSERT INTO session (id, project_id, slug, directory, path, title, version, time_created, time_updated) ' +
      "VALUES (?, 'p', 's', 'D:/elsewhere', 'D:/elsewhere', 'other', '3.18', 1760000000000, 1760000000000)"
  ).run(sid)
  s.prepare(
    'INSERT INTO message (id, session_id, time_created, time_updated, data, sequence) VALUES (?, ?, 1, 1, ?, 0)'
  ).run('mo1', sid, JSON.stringify({ role: 'user', semantics: { origin: 'real_user' } }))
  s.prepare(
    'INSERT INTO part (id, message_id, session_id, time_created, time_updated, data, sequence) VALUES (?, ?, ?, 1, 1, ?, 0)'
  ).run('po1', 'mo1', sid, JSON.stringify({ type: 'text', text: 'other cwd' }))
  s.close()
}

function writeCodexRolloutIn(chome: string, cwd: string): void {
  const ymd = join(chome, 'sessions', '2026', '11', '16')
  mkdirSync(ymd, { recursive: true })
  const id = `rollout-x-${cwd.length}${Date.now()}xxxxxxxxxxxxxxxxxxxxxxxx`.slice(0, 32)
  writeFileSync(
    join(ymd, `rollout-2026-11-16T11-00-00-${id}.jsonl`),
    [
      JSON.stringify({ timestamp: '2026-11-16T11:00:00.000Z', type: 'session_meta', payload: { id, cwd } }),
      JSON.stringify({
        timestamp: '2026-11-16T11:00:01.000Z',
        type: 'response_item',
        payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: `work in ${cwd}` }] }
      })
    ].join('\n') + '\n',
    'utf8'
  )
}
