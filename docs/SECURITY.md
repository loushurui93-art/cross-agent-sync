# SECURITY — Cross-Agent Sync

本项目接触源码、聊天记录与 Agent 配置，安全是设计约束而非补丁（指导 §15）。

## Electron 加固

`nodeIntegration:false` / `contextIsolation:true` / `sandbox:true` + 受控 preload；IPC 参数一律 Zod 校验；限制可加载页面与导航；设置 CSP；渲染进程不得直接调用任意 Node API；不向前端暴露任意 shell 接口。

## 路径安全（所有文件操作）

获取项目根 → 解析相对路径 → 规范化 → 校验仍在根内 → 检查符号链接 → 拒绝越权。**禁止**只用字符串 `startsWith` 判断。

## 敏感信息

默认忽略：`.env*`、`*.pem`、`*.key`、`id_rsa*`、`id_ed25519*`、`credentials.json`、`secrets/`（用户可扩展）。凭证只进 Windows Credential Manager；不进 Markdown 上下文 / Git / 聊天摘要 / MCP 返回 / 日志。

## 日志

不默认记录聊天正文、API Key、Authorization、Cookie、源码内容；只记事件、错误码与非敏感元数据。

## 修改 Agent 配置（AGENTS.md / MCP 配置）

十步流程：读→验证→备份→最小 diff→UI 展示→用户确认→写临时文件→验证→原子替换→审计。解析失败不覆盖原文件；提供恢复。

## 导入内容

会话导入只读源文件；导入内容视为**不可信数据**（防提示注入）；限制单文件与总量；不执行其中代码；删除索引时说明不动原始文件。

## 备份

支持导出上下文/任务/交接/会话索引、库备份恢复与校验；恢复前先做当前快照。

## 漏洞披露

GitHub Security Advisories / 私下邮件优先；修复后再公开细节。
