# SignPath 开源签名申请材料包

> 提交入口：https://signpath.org/apply （表单为 JS 渲染，字段以实际页面为准；
> 下面按该表单的标准字段逐项给出可直接粘贴的内容）。
> 只有两个字段需要你本人提供：**联系邮箱** 和（如表单要求）**你的姓名**。

## 可直接粘贴的字段内容

### Project name / 项目名
```
Cross-Agent Sync
```

### Project website / 项目主页
```
https://github.com/loushurui93-art/cross-agent-sync
```
（仓库即主页；如需单独网站可后续用 GitHub Pages）

### Repository URL / 仓库地址
```
https://github.com/loushurui93-art/cross-agent-sync
```

### Open source license / 许可证
```
MIT
```

### Short description / 一句话简介
```
Local-first shared workspace for AI coding agents — one project, one
shared context across ZCode, Codex and Claude Code.
```

### Full description / 详细描述（如表单有长文本框）
```
Cross-Agent Sync is a local-first desktop application (Windows, Electron)
that gives AI coding agents a shared project memory. It maintains a
versioned, human-readable context directory (.agent-sync/) in the user's
project — overview, architecture, development state, rules, technical
decisions and agent-to-agent handoffs — and exposes it to the agents
through a local MCP (Model Context Protocol) server with 10 tools.

Supported agents today: ZCode (Z.ai), OpenAI Codex, and Claude Code.
Conversations from these agents are imported read-only into a unified
FTS5-searchable index. The app never writes to the agents' private
internal databases.

Distribution: Windows NSIS installer published on GitHub Releases via
GitHub Actions (tag-triggered). This is exactly the artifact we want
signed so end users don't hit SmartScreen / Smart App Control warnings.
```

### Primary language / 主要语言
```
TypeScript
```

### Build system / CI
```
GitHub Actions (release workflow builds the Windows installer from a git tag
and publishes it to GitHub Releases; the workflow file is
.github/workflows/release.yml in the repository)
```

### What artifacts do you want signed / 需要签名的产物
```
The Windows NSIS installer (cross-agent-sync-<version>-setup.exe) and the
app executable inside it, published as GitHub Release assets.
```

### How will users benefit / 签名给用户带来什么
```
End users currently see SmartScreen warnings (and Smart App Control
blocks on some machines) because the installer is unsigned. A trusted
signature removes the biggest adoption barrier for a tool that reads and
writes developer project files.
```

### GitHub profile / GitHub 账号
```
loushurui93-art
```

## 需要你本人提供的（表单里遇到就填）

1. **联系邮箱** —— 建议用 GitHub 账号绑定的邮箱（或 noreply 邮箱：
   `loushurui93-art@users.noreply.github.com`，如果表单要求可回复的邮箱则用真实邮箱）
2. **你的姓名**（如表单要求；Foundation 计划明确"无需个人身份验证"，
   多数情况下只验证仓库与构建，姓名仅作联系人）
3. 表单如出现本文件未覆盖的字段：把字段名贴给我，我补内容

## 获批后（我来做）

- 把 API Token 加进仓库 Secrets（`SIGNPATH_API_TOKEN`）
- 改造 release.yml：electron-builder 产物 → SignPath 签名 → 修正
  latest.yml 哈希 → 发布（签名会改文件哈希，顺序必须正确）
- SHA-256 追加步骤改为取签名后哈希
