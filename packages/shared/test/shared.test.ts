import { describe, expect, it } from 'vitest'
import { appError, nowIso, TASK_STATUSES } from '../src/index'

describe('shared', () => {
  it('exposes the task status set from the guide', () => {
    expect(TASK_STATUSES).toEqual([
      'todo',
      'in_progress',
      'blocked',
      'done',
      'cancelled'
    ])
  })

  it('appError carries code, message and retryability', () => {
    const e = appError('PROJECT_NOT_FOUND', 'no such project')
    expect(e.code).toBe('PROJECT_NOT_FOUND')
    expect(e.retryable).toBe(false)
  })

  it('nowIso returns a parseable UTC timestamp', () => {
    const ts = nowIso()
    expect(ts.endsWith('Z')).toBe(true)
    expect(new Date(ts).toISOString()).toBe(ts) // round-trips exactly
  })
})
