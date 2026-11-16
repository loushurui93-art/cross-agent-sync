# Cross-Agent Sync

**跨 AI Coding Agent 的本地优先共享工作空间——一个项目，一份所有 Agent 共享的上下文。**

[English](README.md) · [PRD](docs/PRD.md) · [架构](docs/ARCHITECTURE.md) · [路线图](docs/ROADMAP.md)

同时用 ZCode 和 Codex（后续支持更多 Agent）开发同一个项目时，每个工具各有一套会话、规则和上下文，切换就要重新解释一切。Cross-Agent Sync 在项目里维护一个独立于厂商的 `.agent-sync/` 共享上下文目录（Markdown，人可读、可进 Git），并通过本地 MCP Server 让每个 Agent 都能读取与更新项目知识、任务和交接记录——**Codex 里做完的事，ZCode 接着干**。

- 🧠 **上下文同步**：项目概览 / 架构 / 开发状态 / 规范 / 技术决策 / Agent 交接
- 🔍 **会话导入**：把 ZCode 与 Codex 的本地会话导入统一索引，全文搜索（只读源，绝不写回）
- 📁 **项目变化**：文件增删改事件 + Git 只读状态
- 🔒 **本地优先**：数据不出本机；修改任何 Agent 配置前先备份、可恢复；导入内容视为不可信数据

状态：**Beta（v0.1.0-beta.1）**。V1 只做 ZCode + Codex 适配器；Claude Code / Cursor 适配器接口已预留。

## Windows 安装包（Beta）

从 [Releases](../../releases) 下载 `cross-agent-sync-*-setup.exe`：

- **未签名构建**：首次运行可能遇到 SmartScreen / Smart App Control 提示——点「更多信息 → 仍要运行」；SAC 强制模式用户如被硬拦，请用 SHA-256 校验文件后暂时改用源码运行（`pnpm dev`）。正式版将接入免费开源签名（SignPath）。
- 安装后数据保存在 `%APPDATA%/Cross-Agent Sync/`，纯本地无上报。

## 开发

```bash
pnpm install
pnpm dev          # 启动桌面应用
pnpm test         # vitest（10 包单测）
pnpm typecheck && pnpm lint
pnpm --filter @cross-agent-sync/desktop e2e   # Playwright E2E（5 流程）
```

要求：Node ≥ 22、pnpm 11。

## 许可

MIT
