/**
 * Drizzle schema. Tables follow guide §7.2; timestamps are ISO 8601 strings,
 * primary keys are stable random ids. Migrations live in `migrations/` and
 * are applied with drizzle's migrator (guide §7.3: FKs on, transactional
 * writes, migration-managed schema).
 */

import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'

export const projects = sqliteTable('projects', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  rootPath: text('root_path').notNull(),
  description: text('description'),
  gitRemote: text('git_remote'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull()
})

export const agents = sqliteTable('agents', {
  id: text('id').primaryKey(),
  type: text('type').notNull(), // AgentKind
  displayName: text('display_name').notNull(),
  configPath: text('config_path'),
  enabled: integer('enabled').notNull().default(0),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull()
})

// Remaining tables (project_agents, contexts, tasks, decisions, handoffs,
// conversations, messages, file_events, audit_logs, sync_states) are added
// in milestone M1 alongside the Core services that use them.
