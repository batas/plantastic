CREATE TABLE `async_tasks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`type` text NOT NULL,
	`plant_id` integer,
	`status` text NOT NULL DEFAULT 'pending',
	`progress` integer NOT NULL DEFAULT 0,
	`result_json` text,
	`error` text,
	`created_at` integer NOT NULL DEFAULT (unixepoch()),
	`started_at` integer,
	`finished_at` integer,
	FOREIGN KEY (`plant_id`) REFERENCES `plants`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `tasks_status_idx` ON `async_tasks` (`status`);--> statement-breakpoint
CREATE INDEX `tasks_plant_idx` ON `async_tasks` (`plant_id`);
