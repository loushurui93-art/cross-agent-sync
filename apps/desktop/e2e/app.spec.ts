/**
 * End-to-end flow over the real Electron app (guide §16.3, condensed):
 * launch → create project → edit context → create task → close →
 * relaunch → verify persistence.
 *
 * The app is launched with CAS_E2E_DIR pointing at a throwaway userData
 * dir so tests never touch real data. The production bundle (out/) is used
 * (electron-vite build runs first via `pnpm e2e`).
 */

import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import { _electron as electron } from 'playwright'
import { mkdtempSync, mkdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

let app: ElectronApplication
let page: Page
let projectDir: string
let userDataDir: string

test.beforeAll(async () => {
  projectDir = mkdtempSync(join(tmpdir(), 'cas-e2e-proj-'))
  mkdirSync(projectDir, { recursive: true })
  userDataDir = mkdtempSync(join(tmpdir(), 'cas-e2e-user-'))
  app = await electron.launch({
    args: ['.'],
    env: { ...process.env, CAS_E2E_DIR: userDataDir, NODE_ENV: 'production' }
  })
  page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
})

test.afterAll(async () => {
  await app?.close()
})

async function createProjectViaUi(): Promise<void> {
  await page.getByRole('button', { name: /项目$/ }).click()
  await page.getByPlaceholder('项目名称').fill('E2E Demo')
  await page.getByPlaceholder('项目根目录').fill(projectDir)
  await page.getByRole('button', { name: '创建项目' }).click()
  await expect(page.getByText('E2E Demo', { exact: true })).toBeVisible()
}

test('launches with the dashboard', async () => {
  await expect(page.getByText('Cross-Agent Sync')).toBeVisible()
  await expect(page.getByRole('button', { name: /仪表盘$/ })).toBeVisible()
})

test('creates a project and scaffolds .agent-sync', async () => {
  await createProjectViaUi()
  const manifest = JSON.parse(
    readFileSync(join(projectDir, '.agent-sync', 'manifest.json'), 'utf8')
  )
  expect(manifest.schemaVersion).toBe(1)
  expect(manifest.projectName).toBe('E2E Demo')
})

test('edits and saves context through the UI', async () => {
  await page.getByRole('button', { name: /上下文$/ }).click()
  await page.getByRole('button', { name: '项目概览' }).click()
  const editor = page.locator('textarea')
  await editor.fill('# E2E Overview\n\nEdited by Playwright.')
  await page.getByRole('button', { name: /保存$/ }).click()
  await expect(page.getByText('已保存')).toBeVisible()
  const onDisk = readFileSync(join(projectDir, '.agent-sync', 'context', 'overview.md'), 'utf8')
  expect(onDisk).toContain('Edited by Playwright.')
})

test('creates a task and flips its status', async () => {
  await page.getByRole('button', { name: /任务$/ }).click()
  await page.getByPlaceholder('新任务标题').fill('e2e-task-1')
  await page.getByRole('button', { name: /添加$/ }).click()
  await expect(page.getByText('e2e-task-1')).toBeVisible()
  await page.locator('select').selectOption('done')
  await expect(page.locator('select')).toHaveValue('done')
})

test('persistence across restart', async () => {
  await app.close()
  app = await electron.launch({
    args: ['.'],
    env: { ...process.env, CAS_E2E_DIR: userDataDir, NODE_ENV: 'production' }
  })
  page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')

  // dashboard renders first after relaunch; navigate from there
  await page.getByRole('button', { name: '☑ 任务' }).click()
  await expect(page.getByText('e2e-task-1')).toBeVisible()
  await page.getByRole('button', { name: '✎ 上下文' }).click()
  await page.getByRole('button', { name: '项目概览' }).click()
  await expect(page.locator('textarea')).toHaveValue(/Edited by Playwright/)
})
