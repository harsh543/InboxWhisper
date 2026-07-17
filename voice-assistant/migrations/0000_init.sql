CREATE TABLE `action_log` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`action_type` text NOT NULL,
	`params_json` text NOT NULL,
	`result_json` text,
	`created_at` integer NOT NULL
);

--> statement-breakpoint
CREATE TABLE `messages` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`role` text NOT NULL,
	`transcript` text,
	`llm_plan_json` text,
	`created_at` integer NOT NULL
);

--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` integer NOT NULL
);

