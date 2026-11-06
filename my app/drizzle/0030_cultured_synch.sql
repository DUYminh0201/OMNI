CREATE TABLE `image_projects` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text,
	`title` text DEFAULT 'Dự án ảnh mới' NOT NULL,
	`product` text DEFAULT '' NOT NULL,
	`brief` text DEFAULT '' NOT NULL,
	`image_type` text DEFAULT 'square' NOT NULL,
	`style` text,
	`aspect` text DEFAULT '1:1' NOT NULL,
	`refs` text DEFAULT '[]' NOT NULL,
	`ideas` text DEFAULT '[]' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `image_projects_workspace_idx` ON `image_projects` (`workspace_id`);--> statement-breakpoint
CREATE TABLE `image_results` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`idea_id` text,
	`file` text NOT NULL,
	`model` text DEFAULT '' NOT NULL,
	`cost_usd` real DEFAULT 0 NOT NULL,
	`selected` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `image_projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `image_results_project_idx` ON `image_results` (`project_id`,`created_at`);