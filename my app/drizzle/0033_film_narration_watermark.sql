ALTER TABLE `film_assets` ADD `narration` text;--> statement-breakpoint
ALTER TABLE `film_assets` ADD `narration_file` text;--> statement-breakpoint
ALTER TABLE `film_assets` ADD `narration_source` text DEFAULT 'tts' NOT NULL;--> statement-breakpoint
ALTER TABLE `film_projects` ADD `narration` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `film_projects` ADD `narration_provider` text;--> statement-breakpoint
ALTER TABLE `film_projects` ADD `narration_voice_id` text;--> statement-breakpoint
ALTER TABLE `film_projects` ADD `watermark_mode` text DEFAULT 'pocket' NOT NULL;--> statement-breakpoint
ALTER TABLE `film_projects` ADD `watermark_path` text;--> statement-breakpoint
ALTER TABLE `film_projects` ADD `watermark_position` text DEFAULT 'br' NOT NULL;--> statement-breakpoint
ALTER TABLE `film_projects` ADD `watermark_opacity` real DEFAULT 0.85 NOT NULL;--> statement-breakpoint
ALTER TABLE `film_projects` ADD `watermark_scale` real DEFAULT 0.185 NOT NULL;