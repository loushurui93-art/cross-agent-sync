# ARCHITECTURE — Cross-Agent Sync

## 分层

```
Desktop UI (React + TS + Tailwind)          — 只做展示与操作，不碰文件/数据库
        │ 受控 IPC（Zod 校验）
Electron Main — 窗口/生命周期/IPC/安全
        │
Application Core — project/context/task/handoff/audit/search（不依赖 Electron）
   ├─ Adapters（zcode / codex：检测、规则文件、MCP 配置、会话导入）
   ├─ MCP Server（STDIO，工具只调 Core）
   └─ File/Git Services（Chokidar / 只读 Git）
        │
Data Layer — SQLite(Drizzle) + Markdown(.agent-sync/) + JSON
```

## 关键约定

- **上下文正文唯一源是项目内 `.agent-sync/**/*.md`**；SQLite 只存索引（相对路径/哈希/版本），避免双写冲突。
- **厂商差异只存在于 Adapter 层**；Core 不写 `if (agent === ...)`。
- **MCP 工具只调 Core**，不绕过权限层直接碰数据库。
- 所有时间 ISO 8601；写操作走事务；schema 走 migration。

## Monorepo 布局

```
apps/desktop          Electron 应用（main/preload/renderer）
packages/shared       跨模块类型 + Zod schema（唯一来源）
packages/core         业务逻辑（不依赖 Electron）
packages/database     Drizzle schema + migrations + client
packages/adapters/    zcode / codex（V1）；claude-code / cursor 预留
packages/mcp-server   STDIO server + 工具注册
packages/conversation 统一消息模型 + 导入 + FTS5 搜索
packages/file-monitor Chokidar + debounce + 忽略规则
packages/git-service  Git 只读
```

原则：不预建空包，按里程碑生长（指导 §6）。

## 技术选型记录

- Electron（非 Tauri）：TS/Node 生态、本地服务集成、Windows 资料多；体积代价已接受（指导 §4.2）。
- **不用 Rust**（指导 §4.3）；zstd 解压用纯 JS（fzstd）。
- MCP SDK 版本在 M2 引入时锁定，不随大版本漂移（指导 §4.4）。

## 旧项目资产

Rust 版 agentsync（已冻结）逆向出的内部格式知识迁移为 `docs/FORMAT-zcode.md`、`docs/FORMAT-codex.md`，作为只读导入器的依据；其 Rust 实现可作翻译参考（`agentsync/crates/agentsync-*/src/read.rs`）。
