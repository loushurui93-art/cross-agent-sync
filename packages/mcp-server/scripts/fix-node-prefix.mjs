/**
 * Build post-fix: esbuild externalizes `node:sqlite` as bare `sqlite`,
 * which Node does NOT expose as a builtin. Restore the prefix in the
 * bundle. Idempotent; fails loudly when the bundle is missing.
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const dist = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'start.js')
let code = readFileSync(dist, 'utf8')
const fixed = code.replace(/from(["'])sqlite\1/g, 'from$1node:sqlite$1').replace(
  /require\((["'])sqlite\1\)/g,
  'require($1node:sqlite$1)'
)
if (fixed !== code) {
  writeFileSync(dist, fixed, 'utf8')
  console.log('fix-node-prefix: restored node: prefix for sqlite')
} else {
  console.log('fix-node-prefix: nothing to fix')
}
