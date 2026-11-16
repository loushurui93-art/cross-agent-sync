# Changelog

All notable changes to this project will be documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

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
