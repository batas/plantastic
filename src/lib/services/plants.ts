import { desc, eq, and } from 'drizzle-orm'
import { db } from '@/lib/db'
import { plants, photos, timelineEntries, careLogs, sensorReadings } from '@/lib/db/schema'
import { CARE_META, CARE_TYPES, type CareType } from '@/lib/care-types'

export async function listPlants() {
  return db.select().from(plants).orderBy(desc(plants.createdAt)).all()
}

export async function getPlant(id: number) {
  return db.select().from(plants).where(eq(plants.id, id)).get()
}

export interface PlantInput {
  name: string
  species?: string
  scientificName?: string
  opbId?: string
  location?: string
  notes?: string
  waterIntervalDays?: number
  fertilizeIntervalDays?: number
  mistIntervalDays?: number
  cleanIntervalDays?: number
  rotateIntervalDays?: number
}

const INTERVAL_FIELDS = [
  'waterIntervalDays',
  'fertilizeIntervalDays',
  'mistIntervalDays',
  'cleanIntervalDays',
  'rotateIntervalDays',
] as const

export async function createPlant(input: PlantInput) {
  const res = db
    .insert(plants)
    .values({
      name: input.name,
      species: input.species ?? null,
      scientificName: input.scientificName ?? null,
      opbId: input.opbId ?? null,
      location: input.location ?? null,
      notes: input.notes ?? null,
      waterIntervalDays: input.waterIntervalDays ?? null,
      fertilizeIntervalDays: input.fertilizeIntervalDays ?? null,
      mistIntervalDays: input.mistIntervalDays ?? null,
      cleanIntervalDays: input.cleanIntervalDays ?? null,
      rotateIntervalDays: input.rotateIntervalDays ?? null,
    })
    .run()
  const id = Number(res.lastInsertRowid)
  return getPlant(id)
}

export async function updatePlant(id: number, input: Partial<PlantInput>) {
  const current = await getPlant(id)
  if (!current) return null
  const patch: Record<string, unknown> = { updatedAt: Math.floor(Date.now() / 1000) }
  for (const key of ['name', 'species', 'scientificName', 'opbId', 'location', 'notes', ...INTERVAL_FIELDS] as const) {
    if (input[key] !== undefined) patch[key] = input[key]
  }
  db.update(plants).set(patch).where(eq(plants.id, id)).run()
  return getPlant(id)
}

export async function deletePlant(id: number) {
  db.delete(plants).where(eq(plants.id, id)).run()
}

export interface PlantDetail {
  plant: NonNullable<Awaited<ReturnType<typeof getPlant>>>
  photos: (typeof photos.$inferSelect)[]
  timeline: (typeof timelineEntries.$inferSelect)[]
  careLogs: (typeof careLogs.$inferSelect)[]
  latestReadings: Record<string, (typeof sensorReadings.$inferSelect)[]>
}

export async function getPlantDetail(id: number): Promise<PlantDetail | null> {
  const plant = await getPlant(id)
  if (!plant) return null
  const [photosList, timeline, logs, readings] = await Promise.all([
    db.select().from(photos).where(eq(photos.plantId, id)).orderBy(desc(photos.createdAt)).all(),
    db
      .select()
      .from(timelineEntries)
      .where(eq(timelineEntries.plantId, id))
      .orderBy(desc(timelineEntries.createdAt))
      .all(),
    db.select().from(careLogs).where(eq(careLogs.plantId, id)).orderBy(desc(careLogs.createdAt)).all(),
    db
      .select()
      .from(sensorReadings)
      .where(eq(sensorReadings.plantId, id))
      .orderBy(desc(sensorReadings.measuredAt))
      .all(),
  ])
  const latest: Record<string, (typeof sensorReadings.$inferSelect)[]> = {}
  for (const r of readings) {
    if (!latest[r.metric]) latest[r.metric] = []
    if (latest[r.metric].length < 200) latest[r.metric].push(r)
  }
  return { plant, photos: photosList, timeline, careLogs: logs, latestReadings: latest }
}

export interface CareStatus {
  type: CareType
  dueAt: number | null
  overdue: boolean
  lastDoneAt: number | null
}

export async function getNextCareDates(plantId: number): Promise<CareStatus[] | null> {
  const plant = await getPlant(plantId)
  if (!plant) return null
  const now = Date.now() / 1000
  const result: CareStatus[] = []
  for (const type of CARE_TYPES) {
    const meta = CARE_META[type]
    const intervalField = meta.intervalField
    const interval = intervalField ? plant[intervalField] : null
    const last = await db
      .select()
      .from(careLogs)
      .where(and(eq(careLogs.plantId, plantId), eq(careLogs.kind, type)))
      .orderBy(desc(careLogs.createdAt))
      .limit(1)
      .get()
    const dueAt = last && interval ? last.createdAt + interval * 86400 : null
    result.push({
      type,
      dueAt,
      overdue: dueAt ? now > dueAt : false,
      lastDoneAt: last?.createdAt ?? null,
    })
  }
  return result
}
