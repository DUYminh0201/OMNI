ALTER TABLE `film_assets` ADD `end_source` text DEFAULT 'auto' NOT NULL;--> statement-breakpoint
ALTER TABLE `film_assets` ADD `end_state` text;--> statement-breakpoint
ALTER TABLE `film_assets` ADD `end_prompt` text;--> statement-breakpoint
ALTER TABLE `film_assets` ADD `end_prompt_src` text;--> statement-breakpoint
ALTER TABLE `film_assets` ADD `selected_end_take_id` text;--> statement-breakpoint
ALTER TABLE `film_projects` ADD `end_frames` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `film_takes` ADD `frame` text;