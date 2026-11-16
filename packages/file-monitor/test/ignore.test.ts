import { describe, expect, it } from 'vitest'
import { isIgnored } from '../src'

describe('ignore rules', () => {
  it('ignores build dirs, caches and secrets', () => {
    for (const p of [
      'node_modules/foo/index.js',
      '.git/config',
      'dist/bundle.js',
      'src/.cache/x',
      'a/out/main.js',
      'coverage/lcov.info'
    ]) {
      expect(isIgnored(p), p).toBe(true)
    }
  })

  it('ignores sensitive files anywhere', () => {
    for (const p of ['.env', 'config/.env.local', 'keys/server.pem', 'home/id_rsa', 'secrets/token.txt']) {
      expect(isIgnored(p), p).toBe(true)
    }
  })

  it('ignores our own managed dirs', () => {
    expect(isIgnored('.agent-sync/context/overview.md')).toBe(true)
    expect(isIgnored('.zcode/config.json')).toBe(true)
  })

  it('keeps normal source files', () => {
    for (const p of ['src/main.ts', 'README.md', 'package.json']) {
      expect(isIgnored(p), p).toBe(false)
    }
    // .env.example intentionally matches the .env.* rule
    expect(isIgnored('src/.env.example')).toBe(true)
  })
})
