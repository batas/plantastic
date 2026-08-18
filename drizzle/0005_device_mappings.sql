CREATE TABLE IF NOT EXISTS device_mappings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plant_id INTEGER NOT NULL REFERENCES plants(id) ON DELETE CASCADE,
  ha_device_id TEXT NOT NULL,
  device_name TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS device_mappings_plant_idx ON device_mappings(plant_id);
