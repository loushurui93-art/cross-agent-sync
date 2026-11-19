# Changelog

All notable changes to this project will be documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.2.6] - 2026-11-20

### Fixed

- **会话可读性改造** — imported conversations now read like the agent's own UI:
  - Titles: stripped Codex boilerplate (`<environment_context>`, AGENTS.md
    instruction blocks, `# Files mentioned` headers). Attachment-only
    conversations are titled `[附件] 文件名`; normal ones use the first real
    user sentence; Claude Code keeps its ai-title.
  - Message bodies: Codex-injected environment/instruction/app-signal blocks
    removed from user messages — the transcript shows what the user actually
    typed.
  - Conversation detail view: user/assistant bubbles color-coded, fenced code
    blocks rendered monospace, `[tool …]` lines rendered as subdued chips.

## [0.2.5] - 2026-11-19

### Added

- **One-click in-app updates** — 检查更新 now auto-downloads the new version
  in the background (live percent bar), then offers 重启并安装 — no more
  manual installer downloads. quitAndInstall with run-after-install.

## [0.2.4] - 2026-11-19

### Added

- **Advanced import options** (Conversations page) — for sessions scattered
  across directories or with no project home:
  - extra scan directories (semicolon-separated) beyond the project root
  - title/first-message keyword filter (applies to extra-dir matches)
  - **导入全部历史（不限目录）** archive mode: pull every session from all
    three agents into the current project's searchable index
- The advanced section is now a clearly visible full-width toggle button.

## [0.2.3] - 2026-11-18

### Fixed

- **检查更新仍报错**（`Cannot set properties of undefined (setting 'autoDownload')`）— under
  the ESM main bundle, `import('electron-updater')` can hide the CJS `autoUpdater`
  export behind `default`; the import now resolves both shapes explicitly and
  throws a clear error if neither exists. Verified end-to-end in the real app:
  the button now completes with "已是最新版本（v0.2.2）" or a clean network error.
- The update check also runs in dev mode now (harmless, aids verification).

## [0.2.2] - 2026-11-18

### Fixed

- **"检查更新"崩溃**（`TypeError: Cannot read properties of undefined (reading 'code')`）— the
  updater IPC handlers returned a raw state object instead of the standard
  `{ok, data}` envelope every other handler uses; the renderer's envelope
  unwrapping then crashed. All updater handlers now return the envelope.
- **Reliable result** — the check now awaits `checkForUpdates()` and compares
  versions explicitly (prerelease-aware) instead of racing event callbacks.

## [0.2.1] - 2026-11-18

### Fixed

- **Conversation page filters now apply to the conversation list** (source +
  time), not only to full-text search results — previously the dropdowns
  appeared to do nothing unless a search query was entered.

### Changed

- Claude Code joins the import button and import summary (three sources).
- List shows a "filtered / total" count with an explicit empty-filter state.

## [0.2.0-beta.1] - 2026-11-17

Three agents, self-explaining first run, and self-maintenance.

### Added

- **Claude Code adapter** — project-level `.mcp.json` (per-project server
  name), `CLAUDE.md` as an `@AGENTS.md` importer, conversation importer
  (`~/.claude/projects/**`, sidechains & thinking filtered).
- **Auto conversation import** — at startup and after project creation;
  codex scan cache (mtime+size) + already-imported pre-filter; force
  re-import replaces conversations whose source grew.
- **First-run onboarding wizard** — welcome → pick project → one-click
  agent connect → done.
- **Health self-check (doctor)** — environment, agent detection, MCP
  config, and a real MCP handshake per agent (Settings page).
- **Search filters** — by agent and time range.
- **Dashboard latest-handoff card**.
- **Context template presets** — generic / frontend / backend / research.
- **Conflict resolution UI** — "keep external edits" or "keep my edits"
  (explicit, audited force-save).
- **In-app update check** — against GitHub Releases (Settings page;
  packaged builds only).
- **Release automation** — tag-triggered Windows installer + GitHub
  Release with SHA-256.

### Changed

- Agent list in onboarding/doctor/status is now driven by the adapter
  registry (three agents: ZCode, Codex, Claude Code).

## [0.1.0-beta.1] - 2026-11-16

- **Claude Code adapter** — third supported agent: project-level `.mcp.json`
  with per-project server name, `CLAUDE.md` generated as an `@AGENTS.md`
  importer, conversation importer (`~/.claude/projects/**`, sidechains &
  thinking filtered). End-to-end flows (onboarding, doctor, cleanup) now
  cover all three agents.
- **Auto conversation import** — startup + after project creation, powered
  by a codex scan cache (mtime+size) and already-imported pre-filter;
  force re-import replaces conversations whose source grew.
- **First-run onboarding wizard** — welcome → pick project → one-click
  agent connect → done (skipped for E2E runs).
- **Health self-check (doctor)** on the Settings page — environment, agent
  detection, per-project MCP config, and a real MCP server handshake.
- **Search filters** — by agent and time range.
- **Dashboard latest-handoff card**.
- **Context template presets** — generic / frontend / backend / research.
- **Conflict resolution UI** — when a context file changed outside the app,
  choose "keep external edits" (reload) or "keep my edits" (explicit,
  audited force-save).
- **Release automation** — tag-triggered workflow builds the Windows
  installer and publishes a GitHub Release with SHA-256.

## [0.1.0-beta.1] - 2026-11-16

First public beta. Local-first shared workspace for ZCode ⇄ Codex.

### Added

- **Projects**: import local directories; per-project `.agent-sync/` scaffold
  (overview / architecture / development-state / rules + tasks + handoffs).
- **Context Manager**: Markdown as the single source of truth, SQLite index
  with version + content hash; external edits are detected and never
  silently overwritten; atomic saves.
- **Tasks**: statuses (todo/in_progress/blocked/done/cancelled) with
  optimistic locking (`expected_version`).
- **MCP Server** (10 tools, STDIO, per-project binding, agent-attributed
  audit trail): `list_projects`, `get_project_context`, `search_context`,
  `get_current_tasks`, `create_task`, `update_task`, `record_decision`,
  `create_handoff`, `get_latest_handoff`, `report_file_change`.
  Verified end-to-end: Codex writes a handoff → ZCode reads it and creates
  tasks (both directions work).
- **Agent onboarding**: guarded config writers for ZCode (user-level
  `~/.zcode/cli/config.json`, per-project server name) and Codex
  (per-project `[mcp_servers.*]` section in `~/.codex/config.toml`) —
  plan → diff preview → confirm (content-hash guarded) → backup → atomic
  write. Legacy entries are cleaned up; removing a project removes its MCP
  entries.
- **Conversation import**: read-only importers for ZCode (`db.sqlite`,
  injected-context filtered) and Codex (rollout JSONL, plain + zstd);
  dedup by agent + external id + source hash; FTS5 (trigram, CJK-friendly)
  full-text search with short-query fallback.
- **File monitoring**: chokidar watcher per project with ignore rules
  (build dirs, secrets, `.agent-sync/`) and per-path debounce; events land
  in `file_events` (system-attributed; agent claims come via MCP).
- **Git (read-only)**: branch, dirty state, changed files, recent commits.
- **Backup / restore**: `VACUUM INTO` snapshots; pre-restore safety
  snapshot; restore from the Settings page.
- **Packaging**: electron-builder Windows build; migrations and the bundled
  MCP server ship as extraResources.
- CI on GitHub Actions (typecheck + lint + 53 unit tests + build);
  Playwright E2E (5 flows incl. restart persistence).

### Security notes

- All data stays on the machine (no network calls, no telemetry).
- Imported conversation content is treated as untrusted data.
- The Windows build is **unsigned** in this beta: expect a SmartScreen /
  Smart App Control prompt on first run; verify the SHA-256 in the release
  notes. See README for details.

### Known limitations

- V1 supports ZCode and Codex only (adapter interfaces are ready for more).
- Conversation import is one-way (into the unified index) by design — no
  lossy round-trips into the agents' private stores.
- Images/attachments in imported conversations are summarized as
  references, not rendered.
