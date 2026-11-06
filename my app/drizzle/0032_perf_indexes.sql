CREATE INDEX `film_takes_film_idx` ON `film_takes` (`film_id`);--> statement-breakpoint
CREATE INDEX `messages_author_idx` ON `messages` (`author`,`created_at`);--> statement-breakpoint
CREATE INDEX `render_jobs_project_idx` ON `render_jobs` (`project_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `posts_content_idx` ON `scheduled_posts` (`content_item_id`);--> statement-breakpoint
CREATE INDEX `posts_status_published_idx` ON `scheduled_posts` (`status`,`published_at`);