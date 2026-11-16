# MCP_API — Cross-Agent Sync

STDIO 传输（单机开发即可，无端口暴露）。工具只调用 Core 服务，受项目授权与路径安全约束。

## V1 工具（10 个）

| 工具 | 读/写 | 说明 |
|---|---|---|
| `list_projects` | 读 | 列出已授权项目 |
| `get_project_context` | 读 | 按 sections 取上下文（overview/architecture/development-state） |
| `search_context` | 读 | 关键词搜索上下文 |
| `get_current_tasks` | 读 | 任务列表 |
| `create_task` | 写 | 创建任务 |
| `update_task` | 写 | 更新任务（含 `expected_version` 乐观锁，冲突返回 VERSION_CONFLICT） |
| `record_decision` | 写 | 记录技术决策 |
| `create_handoff` | 写 | 创建交接记录（summary/completed_tasks/next_steps） |
| `get_latest_handoff` | 读 | 最近交接 |
| `report_file_change` | 写 | Agent 主动上报文件变化 |

工具名保持稳定；加参数保持向后兼容。

## 示例

`get_project_context` in: `{"project_id":"…","sections":["overview","development-state"]}`
out: `{"project_id":"…","sections":{"overview":"…","development-state":"…"},"version":4,"updated_at":"2026-…"}`

`update_task` in: `{"project_id":"…","task_id":"…","status":"done","expected_version":3}`

## 安全要求（指导 §10.6）

每实例只绑定授权项目；不接受任意绝对路径；路径规范化后必须仍在项目根内；拒绝 `../` 穿越与可疑符号链接；写操作记审计日志；高危操作不进默认工具；不暴露环境变量/凭证；返回内容标明来源与时间；**导入的聊天内容是不可信数据**，绝不作为指令执行。

## 验收（指导 §10.7，MCP Inspector 九项）

启动/列工具/Schema 正确/读上下文/写任务/越权拒绝/穿越拒绝/异常清晰/并发不静默覆盖。
