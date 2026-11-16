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

/**
 * Template presets: the four shared docs differ by project type so a new
 * project starts with questions that actually matter to it.
 */
export const TEMPLATE_IDS = ['default', 'frontend', 'backend', 'research'] as const
export type TemplateId = (typeof TEMPLATE_IDS)[number]

export function templatesFor(id: TemplateId): ContextTemplate[] {
  const base = CONTEXT_TEMPLATES
  if (id === 'default') return base
  const overrides: Record<string, Partial<Record<'overview' | 'architecture' | 'rules', string>>> = {
    frontend: {
      architecture: `${HEADER('Architecture')}

## 页面与路由

## 组件结构

## 状态管理

## 样式体系

## 构建与部署

## 已知技术债
`,
      rules: `${HEADER('Development Rules')}

## 组件规范（命名/拆分粒度）

## 浏览器兼容范围

## 性能预算（包体/首屏）

## 测试要求

## 禁止事项
`
    },
    backend: {
      architecture: `${HEADER('Architecture')}

## 服务拓扑

## API 契约

## 数据模型与存储

## 部署拓扑

## 已知技术债
`,
      rules: `${HEADER('Development Rules')}

## API 变更兼容约定

## 数据库迁移规范

## 日志与可观测性

## 测试要求

## 禁止事项
`
    },
    research: {
      architecture: `${HEADER('Architecture')}

## 研究问题

## 方法与数据

## 实验记录索引

## 结论与待验证假设
`,
      rules: `${HEADER('Development Rules')}

## 实验记录规范（参数/种子/环境）

## 数据与代码复现要求

## 引用与来源

## 禁止事项
`
    }
  }
  return base.map((t) => {
    const o = overrides[id]?.[t.type as 'overview' | 'architecture' | 'rules']
    return o ? { ...t, body: o } : t
  })
}

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
