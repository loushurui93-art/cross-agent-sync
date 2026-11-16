CREATE TABLE `file_events` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`relative_path` text NOT NULL,
	`event_type` text NOT NULL,
	`agent_id` text,
	`content_hash` text,
	`note` text,
	`timestamp` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `conversations` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`agent_id` text NOT NULL,
	`external_id` text,
	`title` text,
	`source_path` text,
	`started_at` text,
	`imported_at` text NOT NULL,
	`source_hash` text
);
--> statement-breakpoint
CREATE TABLE `messages` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_id` text NOT NULL,
	`external_id` text,
	`role` text NOT NULL,
	`content` text,
	`content_json` text,
	`sequence` integer NOT NULL,
	`timestamp` text
);
--> statement-breakpoint
CREATE TABLE `sync_states` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`kind` text NOT NULL,
	`cursor` text,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `file_events_project_idx` ON `file_events` (`project_id`);
--> statement-breakpoint
CREATE INDEX `conversations_project_idx` ON `conversations` (`project_id`);
--> statement-breakpoint
CREATE INDEX `messages_conversation_idx` ON `messages` (`conversation_id`);
