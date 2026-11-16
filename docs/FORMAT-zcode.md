# FORMAT-zcode — ZCode 本地数据（只读导入依据）

> 迁移自已冻结的 agentsync 项目逆向成果。这些是**内部不稳定格式**，仅用于只读导入；
> schema 升级只影响导入器，绝不写入。已验证版本：ZCode 桌面 3.18.0 / CLI store 引擎 0.17.1（迁移 0001–0025），并对照 zai-org/ZCode 源码。

## 会话存储 `~/.zcode/cli/db/db.sqlite`（WAL）

核心表：

- `session(id, project_id, workspace_id, parent_id, slug, directory, path, title, version, …, time_created, time_updated, time_archived, task_type, title_source, …, time_deleted, last_outcome)`——epoch-ms 时间戳；`time_deleted`/`time_archived` 软删；`parent_id IS NULL` 为顶层会话。
- `message(id, session_id, time_created, time_updated, data JSON, sequence)`——sequence 会话内 0 起有序。
- `part(id, message_id, session_id, …, data JSON, sequence)`。
- 辅助：`turn_usage`/`model_usage`/`tool_usage`（统计）、`session_runtime_presence`（运行锁）、`session_purge`（墓碑）、`schema_migration`。

`message.data` 关键字段：`role`(user/assistant)、`modelId`、`semantics`。

**真实用户消息 vs 注入上下文**（导入过滤的关键）：

- 真实：`semantics.origin == "real_user"` 且 `kind == "user_prompt"`、`uiVisibility == "visible"`
- 注入（丢弃）：`origin` 为 `agent_runtime`/`system`，如 `system_reminder`，`uiVisibility == "hidden"`，或 `synthetic == true`

`part.data` 按 `type`：`text`、`reasoning`、`tool`（`callID`、`tool`、`state{status, input, output, …}`）、`step-finish`、`file`（图片：`mime`+`url`）。

## 读取顺序

`ORDER BY sequence`（`sequence IS NULL` 的旧行按 `time_created, id`）。

## 桌面索引 `~/.zcode/v2/tasks-index.sqlite`

`tasks(PK workspace_key+task_id, task_id=CLI session id, title, provider='glm' 过滤, cli_* 镜像列, …)`；`projects`/`project_roots`（root_path→project）。可用于取标题与项目归属。

## resume 列表条件（供理解，不需要写）

`time_deleted IS NULL AND 无 purge 行 AND parent_id IS NULL AND directory = <cwd>`。

## MCP 配置（适配器写入目标，非私有格式）

项目级 `<repo>/.zcode/config.json` 或 `zcode.json` 的 `mcp.servers`（stdio: `command` 字符串 + `args[]` + `env`；**schema 严格，未知键整台服务器被丢弃；不展开 `${...}` 模板，须用绝对路径**）。用户级 `~/.zcode/cli/config.json` 的同名服务器会覆盖项目级（适配器须检测冲突）。会话启动时自动连接。ZCode 原生支持 `AGENTS.md` 指令文件。
