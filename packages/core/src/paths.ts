/**
 * Path safety (guide §15.2): every relative path is resolved, normalized and
 * verified to stay inside the project root. Never rely on a bare string
 * `startsWith`.
 */

import { resolve, sep, dirname, join } from 'node:path'
import { appError } from '@cross-agent-sync/shared'

/** Resolve `rel` inside `root` or throw PATH_OUTSIDE_PROJECT. */
export function resolveWithin(root: string, rel: string): string {
  const absRoot = resolve(root)
  const abs = resolve(absRoot, rel)
  const relFromRoot = abs.length >= absRoot.length
    ? abs.slice(absRoot.length)
    : ''
  // The resolved path must be the root itself or live under it (platform
  // separator check catches `..` escapes and cross-drive tricks).
  if (abs !== absRoot && !relFromRoot.startsWith(sep)) {
    throw appError(
      'PATH_OUTSIDE_PROJECT',
      `path escapes project root: ${rel}`
    )
  }
  return abs
}

/** True when `rel` (after normalization) still points inside `root`. */
export function isWithin(root: string, rel: string): boolean {
  try {
    resolveWithin(root, rel)
    return true
  } catch {
    return false
  }
}

export function parentDir(p: string): string {
  return dirname(p)
}

export function joinWithin(root: string, ...parts: string[]): string {
  return resolveWithin(root, join(...parts))
}
