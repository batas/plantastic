CREATE TABLE `care_overrides` (
  `id` INTEGER PRIMARY KEY AUTOINCREMENT,
  `plant_id` INTEGER NOT NULL REFERENCES `plants`(`id`) ON DELETE CASCADE,
  `kind` TEXT NOT NULL,
  `due_at` INTEGER NOT NULL,
  `reason` TEXT,
  `urgency` TEXT NOT NULL DEFAULT 'medium',
  `created_at` INTEGER NOT NULL DEFAULT (unixepoch()),
  `resolved_at` INTEGER
);
CREATE INDEX IF NOT EXISTS `care_overrides_plant_idx` ON `care_overrides` (`plant_id`, `resolved_at`);
