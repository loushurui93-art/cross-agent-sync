# ROADMAP — Cross-Agent Sync

版本号反映成熟度而非日期（指导 §19.4）。

## V1（当前，目标 v1.0.0）

- **M0 ✅ 进行中** 工程与文档基线：monorepo、Electron 基础、docs、CI。
  验收：应用启动 / SQLite 初始化 / CI 绿。
- **M1** 项目与上下文闭环：Project CRUD、`.agent-sync/` 脚手架、Context/Task Manager、Dashboard。
  验收：建项目→编辑上下文→重启不丢；移除项目不删源码。
- **M2** MCP Server：10 工具、授权、路径安全、乐观锁。
  验收：MCP Inspector 九项全过。
- **M3** 双 Agent 闭环（MVP 证明点）：ZCode+Codex 适配器（检测/AGENTS.md/MCP 配置助手/备份恢复）。
  验收：Codex 经 MCP 写交接 → ZCode 经 MCP 读取并继续；越权/穿越被拒。
- **M4** 会话导入+文件监控：双源导入（去重/来源/解析器版本）、FTS5 搜索页、Chokidar、Git 只读。
- **M5** 测试与发布 v0.1.0：Playwright E2E 十步、备份恢复、Windows 打包、Release+SHA-256。

版本阶梯：0.1.0 可运行原型 → 0.2.0 MCP 可用 → 0.5.0 双 Agent 交接可用 → 0.8.0 会话+文件 → 1.0.0 通过验收。

## V1 后（P1/P2）

- Claude Code、Cursor 适配器（接口已预留）
- 聊天全文搜索增强、多设备 Git 同步工作流（`.agent-sync/` 进 Git）
- 可选云同步（端到端加密，仅在真实需求出现时）
- 明确不做：自动编排、自动总结一切、重造文件版本控制

## 发布与签名

三阶段：未签名 + SHA-256 + 明示安全警告 → SignPath Foundation 免费签名 → 远期 MSIX/Store。
