CREATE INDEX IF NOT EXISTS readings_latest_idx ON sensor_readings (plant_id, metric, measured_at DESC);
