# Cross-Agent Sync

**跨 AI Coding Agent 的本地优先共享工作空间——一个项目，一份所有 Agent 共享的上下文。**

[English](README.md) · [PRD](docs/PRD.md) · [架构](docs/ARCHITECTURE.md) · [路线图](docs/ROADMAP.md)

同时用 ZCode 和 Codex（后续支持更多 Agent）开发同一个项目时，每个工具各有一套会话、规则和上下文，切换就要重新解释一切。Cross-Agent Sync 在项目里维护一个独立于厂商的 `.agent-sync/` 共享上下文目录（Markdown，人可读、可进 Git），并通过本地 MCP Server 让每个 Agent 都能读取与更新项目知识、任务和交接记录——**Codex 里做完的事，ZCode 接着干**。

- 🧠 **上下文同步**：项目概览 / 架构 / 开发状态 / 规范 / 技术决策 / Agent 交接
- 🔍 **会话导入**：把 ZCode 与 Codex 的本地会话导入统一索引，全文搜索（只读源，绝不写回）
- 📁 **项目变化**：文件增删改事件 + Git 只读状态
- 🔒 **本地优先**：数据不出本机；修改任何 Agent 配置前先备份、可恢复；导入内容视为不可信数据

状态：**早期开发中**（M0）。V1 只做 ZCode + Codex 适配器。

## 开发

```bash
pnpm install
pnpm dev          # 启动桌面应用
pnpm test         # vitest
pnpm typecheck && pnpm lint
```

要求：Node ≥ 22、pnpm 11。

## 许可

MIT
