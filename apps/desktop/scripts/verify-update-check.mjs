/**
 * End-to-end verification of the 检查更新 button: launches the built app,
 * opens Settings, clicks the button and prints the resulting message.
 * Run from apps/desktop after `electron-vite build`:
 *   node scripts/verify-update-check.mjs
 */

import { _electron as electron } from 'playwright'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const userData = mkdtempSync(join(tmpdir(), 'cas-verify-user-'))
const app = await electron.launch({
  args: ['.'],
  env: { ...process.env, CAS_E2E_DIR: userData, NODE_ENV: 'production' }
})
const page = await app.firstWindow()
await page.waitForLoadState('domcontentloaded')

await page.getByRole('button', { name: '⚙ 设置' }).click()
await page.getByRole('button', { name: '检查更新' }).click()

// result message appears in the update card (phase error/up-to-date/available)
const msg = page.locator('text=/检查失败|已是最新版本|发现新版本|UPDATE_ERROR|TypeError/')
await msg.first().waitFor({ timeout: 30_000 })
console.log('RESULT:', (await msg.first().textContent())?.trim())

await app.close()
