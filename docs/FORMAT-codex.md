# FORMAT-codex — Codex 本地数据（只读导入依据）

> 迁移自已冻结的 agentsync 项目逆向成果，对照 openai/codex 源码（`codex-rs/rollout`、`history`、`protocol`）。仅只读导入。已验证版本：Codex cli 0.159.2 / Codex Desktop。

## 会话 rollout `~/.codex/sessions/YYYY/MM/DD/rollout-<ts>-<uuid7>.jsonl[.zst]`

每行一个 JSON 信封：`{"timestamp":"RFC3339","ordinal":n,"type":"…","payload":{…}}`。

行类型：

- `session_meta`（首行）：`id`/`session_id`（=文件名 uuid）、`creator_user_id`、`cwd`、`originator`、`cli_version`、`source`、`model_provider`
- `turn_context`：`turn_id`、`cwd`、`workspace_roots`、`current_date`、`timezone`、`approval_policy`、`sandbox_policy`（可含 `model`）
- `response_item`（对话主体，Responses-API 形状）：
  - message：`role` + `content:[{type:"input_text"|"output_text", text}]`（附件以 `# Files mentioned by the user:` 文本块出现）
  - reasoning：`summary:[{type:"summary_text", text}]`
  - function_call / custom_tool_call：`call_id`、`name`、`arguments`（**原始 JSON 字符串**）
  - function_call_output / custom_tool_call_output：按 `call_id` 配对；`output` 为内容数组或纯串（版本相关）
- `event_msg`（UI 事件流：user_message、item_completed/AgentMessage/CommandExecution 等）
- `compacted`：`message` 摘要（压缩边界）

读取注意：约 7 天未动的文件被 zstd 压缩为 `.zst`（解压用 fzstd）；尾部断行容忍（跳过无换行的末行）。

## 索引（只读取标题/归档态）

- `state_5.sqlite` 表 `threads`（权威注册表：`rollout_path` 不带 `.zst` 后缀、title、archived、cwd）
- `session_index.jsonl`：`{id, thread_name, updated_at}` 追加式
- `thread_history_1.sqlite`：增量投影（无需关心）

## MCP 配置（适配器写入目标，非私有格式）

`~/.codex/config.toml` 的 `[mcp_servers.<name>]`（`command` / `args[]` / `env_vars`/`env`——M3 时按本机 0.159.x 现有配置核验字段名）。Codex 读取项目根 `AGENTS.md`。
