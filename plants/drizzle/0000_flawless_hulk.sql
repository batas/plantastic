CREATE TABLE `care_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`plant_id` integer NOT NULL,
	`kind` text NOT NULL,
	`amount` real,
	`unit` text,
	`notes` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`plant_id`) REFERENCES `plants`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `care_plant_idx` ON `care_logs` (`plant_id`);--> statement-breakpoint
CREATE INDEX `care_plant_kind_idx` ON `care_logs` (`plant_id`,`kind`);--> statement-breakpoint
CREATE TABLE `photos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`plant_id` integer NOT NULL,
	`path` text NOT NULL,
	`thumb_path` text,
	`caption` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`plant_id`) REFERENCES `plants`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `photos_plant_idx` ON `photos` (`plant_id`);--> statement-breakpoint
CREATE TABLE `plants` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`species` text,
	`scientific_name` text,
	`opb_id` integer,
	`location` text,
	`notes` text,
	`water_interval_days` integer,
	`fertilize_interval_days` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `plants_name_idx` ON `plants` (`name`);--> statement-breakpoint
CREATE TABLE `sensor_mappings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`plant_id` integer NOT NULL,
	`topic` text NOT NULL,
	`metric` text NOT NULL,
	FOREIGN KEY (`plant_id`) REFERENCES `plants`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sensor_topic_idx` ON `sensor_mappings` (`topic`);--> statement-breakpoint
CREATE TABLE `sensor_readings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`plant_id` integer NOT NULL,
	`metric` text NOT NULL,
	`value` real NOT NULL,
	`unit` text,
	`measured_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`plant_id`) REFERENCES `plants`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `readings_plant_metric_idx` ON `sensor_readings` (`plant_id`,`metric`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `timeline_entries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`plant_id` integer NOT NULL,
	`photo_id` integer,
	`kind` text DEFAULT 'note' NOT NULL,
	`title` text,
	`content` text,
	`data_json` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`plant_id`) REFERENCES `plants`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`photo_id`) REFERENCES `photos`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `timeline_plant_idx` ON `timeline_entries` (`plant_id`);