# DATABASE — Cross-Agent Sync

SQLite（better-sqlite3 + Drizzle ORM），库文件在 Electron `userData` 目录；所有 schema 变更走 `packages/database/drizzle/` 迁移。

## 存储分工（指导 §7.1）

| 数据 | 主存储 | 说明 |
|---|---|---|
| 项目/Agent/任务/事件元数据 | SQLite | 结构化状态 |
| 上下文正文 | Markdown（`.agent-sync/`） | 人可读、可 Git |
| 上下文索引 | SQLite | 路径/哈希/版本 |
| 聊天消息 | SQLite | 结构化 + FTS5 |
| 文件版本 | Git | 不复制 Git 职责 |
| 凭证 | 操作系统凭据存储 | 绝不进库/进 Git |

## V1 表清单（指导 §7.2）

`projects`、`agents`、`project_agents`、`contexts`、`tasks`（状态枚举 todo/in_progress/blocked/done/cancelled）、`decisions`、`handoffs`、`conversations`、`messages`（content + content_json 双轨，保留原始结构）、`file_events`、`audit_logs`、`sync_states`。

当前已迁移：`0000_init` = projects + agents（随 M1 增量补齐其余表）。

## 实施要求

外键开启（`PRAGMA foreign_keys=ON`）；写走事务；主键为 UUID/随机 id；时间 ISO 8601；删除项目需二次确认且不删源码目录；FTS5 索引可随时重建；缓存不作唯一数据源；不把在用 SQLite 文件直接交 Git 同步。

## FTS5（M4）

虚拟表索引：会话标题、消息正文、Agent 名、项目名、工具调用摘要；命中返回片段+项目+Agent+会话+时间+来源。
