CREATE TABLE `project_agents` (
	`project_id` text NOT NULL,
	`agent_id` text NOT NULL,
	`status` text DEFAULT 'unknown' NOT NULL,
	`last_seen_at` text,
	`created_at` text NOT NULL,
	PRIMARY KEY (`project_id`, `agent_id`)
);
--> statement-breakpoint
CREATE TABLE `contexts` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`context_type` text NOT NULL,
	`title` text NOT NULL,
	`relative_path` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`content_hash` text,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`status` text DEFAULT 'todo' NOT NULL,
	`priority` integer DEFAULT 2 NOT NULL,
	`assigned_agent_id` text,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `decisions` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`title` text NOT NULL,
	`summary` text,
	`relative_path` text,
	`agent_id` text,
	`decided_at` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `handoffs` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`from_agent_id` text,
	`to_agent_id` text,
	`summary` text NOT NULL,
	`completed_tasks_json` text,
	`next_steps_json` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `audit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text,
	`actor_type` text NOT NULL,
	`actor_id` text,
	`action` text NOT NULL,
	`target_type` text,
	`target_id` text,
	`result` text NOT NULL,
	`details_json` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `contexts_project_idx` ON `contexts` (`project_id`);
--> statement-breakpoint
CREATE INDEX `tasks_project_idx` ON `tasks` (`project_id`);
--> statement-breakpoint
CREATE INDEX `handoffs_project_idx` ON `handoffs` (`project_id`);
--> statement-breakpoint
CREATE INDEX `audit_project_idx` ON `audit_logs` (`project_id`);
