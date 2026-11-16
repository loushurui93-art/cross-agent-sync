/**
 * Scaffold templates for `.agent-sync/` (guide §8). Bodies follow the
 * guide's suggested outlines so every project starts from the same shape.
 */

import type { ContextType } from '@cross-agent-sync/shared'
import { APP_DIR_NAME } from '@cross-agent-sync/shared'

export interface ContextTemplate {
  type: ContextType
  title: string
  relativePath: string
  body: string
}

const HEADER = (title: string) => `# ${title}\n`

export const CONTEXT_TEMPLATES: ContextTemplate[] = [
  {
    type: 'overview',
    title: 'Project Overview',
    relativePath: 'context/overview.md',
    body: `${HEADER('Project Overview')}

## 项目目标

## 目标用户

## 核心功能

## 当前版本

## 技术栈

## 重要限制

## 相关文档
`
  },
  {
    type: 'architecture',
    title: 'Architecture',
    relativePath: 'context/architecture.md',
    body: `${HEADER('Architecture')}

## 总体结构

## 模块职责

## 数据流

## 关键决策与理由

## 已知技术债
`
  },
  {
    type: 'development-state',
    title: 'Development State',
    relativePath: 'context/development-state.md',
    body: `${HEADER('Development State')}

## 当前阶段

## 已完成

- [x] （示例）项目初始化

## 进行中

- [ ] （示例任务）

## 待处理

- [ ] （示例任务）

## 当前阻塞

## 最近更新

## 下一步建议
`
  },
  {
    type: 'rules',
    title: 'Development Rules',
    relativePath: 'context/rules.md',
    body: `${HEADER('Development Rules')}

## 代码规范

## 分支与提交约定

## 测试要求

## 禁止事项
`
  }
]

export const DECISIONS_DIR = 'context/decisions'
export const HANDOFFS_DIR = 'handoffs'
export const TASKS_FILE = 'tasks/tasks.json'

export function manifestJson(input: {
  projectId: string
  projectName: string
  createdAt: string
  updatedAt: string
}): string {
  return JSON.stringify(
    {
      schemaVersion: 1,
      projectId: input.projectId,
      projectName: input.projectName,
      createdAt: input.createdAt,
      updatedAt: input.updatedAt,
      contextFiles: CONTEXT_TEMPLATES.map((t) => t.relativePath)
    },
    null,
    2
  )
}

export function initialTasksJson(): string {
  return JSON.stringify({ schemaVersion: 1, tasks: [] }, null, 2)
}

export { APP_DIR_NAME }
