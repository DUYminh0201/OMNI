ALTER TABLE `film_assets` DROP COLUMN `end_source`;--> statement-breakpoint
ALTER TABLE `film_assets` DROP COLUMN `end_state`;--> statement-breakpoint
ALTER TABLE `film_assets` DROP COLUMN `end_prompt`;--> statement-breakpoint
ALTER TABLE `film_assets` DROP COLUMN `end_prompt_src`;--> statement-breakpoint
ALTER TABLE `film_assets` DROP COLUMN `selected_end_take_id`;--> statement-breakpoint
DELETE FROM `film_takes` WHERE `frame` = 'end';--> statement-breakpoint
UPDATE `film_projects` SET `end_frames` = 0;