/**
 * Capture real app screenshots for the README.
 *
 * Run from apps/desktop after `electron-vite build`:
 *   node ../../scripts/capture-screenshots.mjs
 *
 * Uses an isolated userData dir; seeds a demo project with context, tasks
 * and a git history so the screenshots show a lived-in workspace, then
 * captures every page into docs/screenshots/.
 */

import { _electron as electron } from 'playwright'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const run = promisify(execFile)
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'docs', 'screenshots')
mkdirSync(OUT, { recursive: true })

const userData = mkdtempSync(join(tmpdir(), 'cas-shot-user-'))
const projectDir = mkdtempSync(join(tmpdir(), 'cas-shot-proj-'))
mkdirSync(join(projectDir, 'src'), { recursive: true })
writeFileSync(join(projectDir, 'src', 'index.ts'), 'export const answer = 42\n')

const app = await electron.launch({
  args: ['.'],
  env: { ...process.env, CAS_E2E_DIR: userData, NODE_ENV: 'production' }
})
const page = await app.firstWindow()
await page.setViewportSize({ width: 1280, height: 800 })
await page.waitForLoadState('domcontentloaded')

const shot = async (name) => {
  await page.screenshot({ path: join(OUT, `${name}.png`) })
  console.log('📸', name)
}

// seed the demo project through the real UI (Projects page)
await page.getByRole('button', { name: '▤ 项目' }).click()
await page.getByPlaceholder('项目名称').fill('Deep Space Dashboard')
await page.getByPlaceholder('项目根目录').fill(projectDir)
await page.getByRole('button', { name: '创建项目' }).click()
await page.getByText('Deep Space Dashboard', { exact: true }).waitFor()

// onboarding shot: clear the flag + empty the DB is overkill — instead show
// the wizard by removing projects later; here we keep the seeded state.
await page.getByRole('button', { name: '⌂ 仪表盘' }).click()
await shot('dashboard')

// context editor with real content
await page.getByRole('button', { name: '✎ 上下文' }).click()
await page.getByRole('button', { name: '项目概览' }).click()
await page.locator('textarea').fill(
  [
    '# Deep Space Dashboard',
    '',
    '为观测站团队提供实时遥测面板。',
    '',
    '## 项目目标',
    '- 聚合 12 个深空探测器的遥测流',
    '- 延迟 < 2s 的实时曲线与告警',
    '',
    '## 技术栈',
    'TypeScript · React · WebSocket · TimescaleDB',
    ''
  ].join('\n')
)
await page.getByRole('button', { name: /保存$/ }).click()
await page.getByText('已保存').waitFor()
await shot('context')

// tasks
await page.getByRole('button', { name: '☑ 任务' }).click()
await page.getByPlaceholder('新任务标题').fill('对接探测器遥测 WebSocket 网关')
await page.getByRole('button', { name: /添加$/ }).click()
await page.getByPlaceholder('新任务标题').fill('实现告警阈值配置界面')
await page.getByRole('button', { name: /添加$/ }).click()
await page.waitForTimeout(300)
await shot('tasks')

// agents page
await page.getByRole('button', { name: '⚡ Agent 接入' }).click()
await page.waitForTimeout(300)
await shot('agents')

// conversations page
await page.getByRole('button', { name: '💬 会话' }).click()
await page.waitForTimeout(300)
await shot('conversations')

// files page — give the demo dir a git history first
try {
  await run('git', ['init', '-q'], { cwd: projectDir })
  await run('git', ['config', 'user.email', 'demo@demo'], { cwd: projectDir })
  await run('git', ['config', 'user.name', 'demo'], { cwd: projectDir })
  await run('git', ['add', '.'], { cwd: projectDir })
  await run('git', ['commit', '-q', '-m', 'init telemetry skeleton'], { cwd: projectDir })
} catch {
  /* git optional */
}
await page.getByRole('button', { name: 'Δ 文件' }).click()
await page.waitForTimeout(800)
await shot('files')

// settings
await page.getByRole('button', { name: '⚙ 设置' }).click()
await page.waitForTimeout(300)
await shot('settings')

await app.close()
console.log('done →', OUT)
