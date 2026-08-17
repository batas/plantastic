import { sql } from 'drizzle-orm'
import { index, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const plants = sqliteTable(
  'plants',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull(),
    species: text('species'),
    scientificName: text('scientific_name'),
    opbId: text('opb_id'),
    opbGuideJson: text('opb_guide_json'),
    location: text('location'),
    notes: text('notes'),
    waterIntervalDays: integer('water_interval_days'),
    fertilizeIntervalDays: integer('fertilize_interval_days'),
    mistIntervalDays: integer('mist_interval_days'),
    cleanIntervalDays: integer('clean_interval_days'),
    rotateIntervalDays: integer('rotate_interval_days'),
    createdAt: integer('created_at').notNull().default(sql`(unixepoch())`),
    updatedAt: integer('updated_at').notNull().default(sql`(unixepoch())`),
  },
  (t) => [index('plants_name_idx').on(t.name)],
)

export const photos = sqliteTable(
  'photos',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    plantId: integer('plant_id')
      .notNull()
      .references(() => plants.id, { onDelete: 'cascade' }),
    path: text('path').notNull(),
    thumbPath: text('thumb_path'),
    caption: text('caption'),
    createdAt: integer('created_at').notNull().default(sql`(unixepoch())`),
  },
  (t) => [index('photos_plant_idx').on(t.plantId)],
)

export const timelineEntries = sqliteTable(
  'timeline_entries',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    plantId: integer('plant_id')
      .notNull()
      .references(() => plants.id, { onDelete: 'cascade' }),
    photoId: integer('photo_id').references(() => photos.id, {
      onDelete: 'set null',
    }),
    kind: text('kind').notNull().default('note'), // note | care_plan | event
    title: text('title'),
    content: text('content'),
    dataJson: text('data_json'),
    createdAt: integer('created_at').notNull().default(sql`(unixepoch())`),
  },
  (t) => [index('timeline_plant_idx').on(t.plantId)],
)

export const careLogs = sqliteTable(
  'care_logs',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    plantId: integer('plant_id')
      .notNull()
      .references(() => plants.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(), // water | fertilize
    amount: real('amount'),
    unit: text('unit'),
    notes: text('notes'),
    createdAt: integer('created_at').notNull().default(sql`(unixepoch())`),
  },
  (t) => [index('care_plant_idx').on(t.plantId), index('care_plant_kind_idx').on(t.plantId, t.kind)],
)

export const sensorMappings = sqliteTable(
  'sensor_mappings',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    plantId: integer('plant_id')
      .notNull()
      .references(() => plants.id, { onDelete: 'cascade' }),
    topic: text('topic').notNull(),
    metric: text('metric').notNull(), // moisture | temperature | light
  },
  (t) => [index('sensor_topic_idx').on(t.topic)],
)

export const sensorReadings = sqliteTable(
  'sensor_readings',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    plantId: integer('plant_id')
      .notNull()
      .references(() => plants.id, { onDelete: 'cascade' }),
    metric: text('metric').notNull(),
    value: real('value').notNull(),
    unit: text('unit'),
    measuredAt: integer('measured_at').notNull().default(sql`(unixepoch())`),
  },
  (t) => [index('readings_plant_metric_idx').on(t.plantId, t.metric)],
)

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
})

export type Plant = typeof plants.$inferSelect
export type Photo = typeof photos.$inferSelect
export type TimelineEntry = typeof timelineEntries.$inferSelect
export type CareLog = typeof careLogs.$inferSelect
export type SensorMapping = typeof sensorMappings.$inferSelect
export type SensorReading = typeof sensorReadings.$inferSelect
