CREATE TABLE `tts_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`text` text NOT NULL,
	`provider` text NOT NULL,
	`model` text,
	`voice_id` text,
	`voice_label` text,
	`pause_sec` real DEFAULT 0.5 NOT NULL,
	`chars` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`progress` real DEFAULT 0 NOT NULL,
	`chunks_done` integer DEFAULT 0 NOT NULL,
	`chunks_total` integer DEFAULT 0 NOT NULL,
	`file` text,
	`duration_sec` real,
	`error` text,
	`started_at` integer,
	`finished_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `tts_jobs_created_idx` ON `tts_jobs` (`created_at`);