CREATE TABLE `plants_new` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`species` text,
	`scientific_name` text,
	`opb_id` text,
	`location` text,
	`notes` text,
	`water_interval_days` integer,
	`fertilize_interval_days` integer,
	`mist_interval_days` integer,
	`clean_interval_days` integer,
	`rotate_interval_days` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);--> statement-breakpoint
INSERT INTO `plants_new` (`id`, `name`, `species`, `scientific_name`, `opb_id`, `location`, `notes`, `water_interval_days`, `fertilize_interval_days`, `mist_interval_days`, `clean_interval_days`, `rotate_interval_days`, `created_at`, `updated_at`)
SELECT `id`, `name`, `species`, `scientific_name`, CAST(`opb_id` AS TEXT), `location`, `notes`, `water_interval_days`, `fertilize_interval_days`, `mist_interval_days`, `clean_interval_days`, `rotate_interval_days`, `created_at`, `updated_at`
FROM `plants`;--> statement-breakpoint
DROP TABLE `plants`;--> statement-breakpoint
ALTER TABLE `plants_new` RENAME TO `plants`;--> statement-breakpoint
CREATE INDEX `plants_name_idx` ON `plants` (`name`);
