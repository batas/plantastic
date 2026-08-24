import { desc, eq, max } from 'drizzle-orm'
import { db } from '@/lib/db'
import { plants, photos, timelineEntries, careLogs, sensorReadings, type CareOverride } from '@/lib/db/schema'
import { CARE_META, CARE_TYPES, type CareType } from '@/lib/care-types'
import { getUnresolvedOverrides } from './care-overrides'

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
  carePlanDays?: number | null
  sensorCheck?: boolean
}

const INTERVAL_FIELDS = [
  'waterIntervalDays',
  'fertilizeIntervalDays',
  'mistIntervalDays',
  'cleanIntervalDays',
  'rotateIntervalDays',
  'carePlanDays',
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
      carePlanDays: input.carePlanDays ?? null,
      sensorCheck: input.sensorCheck ?? false,
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
  if (input.sensorCheck !== undefined) patch.sensorCheck = input.sensorCheck
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
  /** AI override accelerated the due date (or created one when no schedule existed). */
  aiReason?: string
  aiUrgency?: 'high' | 'medium' | 'low'
}

export async function getNextCareDates(plantId: number): Promise<CareStatus[] | null> {
  const plant = await getPlant(plantId)
  if (!plant) return null
  const [lastByKind, overrides] = await Promise.all([
    Promise.resolve(
      db
        .select({ kind: careLogs.kind, lastAt: max(careLogs.createdAt) })
        .from(careLogs)
        .where(eq(careLogs.plantId, plantId))
        .groupBy(careLogs.kind)
        .all()
        .map((r): [string, number | null] => [r.kind as string, Number(r.lastAt)]),
    ),
    Promise.resolve(getUnresolvedOverrides(plantId)),
  ])
  return buildCareStatuses(plant, new Map(lastByKind), overrides)
}

function overrideMap(overrides: CareOverride[] | undefined): Map<string, CareOverride> {
  const map = new Map<string, CareOverride>()
  for (const o of overrides ?? []) map.set(o.kind, o)
  return map
}

/**
 * Compute due/overdue status for every care type given each type's last done timestamp.
 * Unresolved AI overrides accelerate the due date when earlier than the regular schedule
 * (and create a due date even when the plant has no interval configured for that kind).
 */
export function buildCareStatuses(
  plant: typeof plants.$inferSelect,
  lastByKind: Map<string, number | null>,
  overrides?: CareOverride[],
): CareStatus[] {
  const now = Date.now() / 1000
  const byKind = overrideMap(overrides)
  return CARE_TYPES.map((type) => {
    const meta = CARE_META[type]
    const interval = meta.intervalField ? plant[meta.intervalField] : null
    const lastAt = lastByKind.get(type) ?? null
    let dueAt = lastAt != null && interval ? lastAt + interval * 86400 : null

    const ai = byKind.get(type)
    let aiReason: string | undefined
    let aiUrgency: 'high' | 'medium' | 'low' | undefined
    if (ai && (dueAt == null || ai.dueAt < dueAt)) {
      dueAt = ai.dueAt
      aiReason = ai.reason ?? undefined
      aiUrgency = (ai.urgency as CareStatus['aiUrgency']) ?? 'medium'
    }
    return {
      type,
      dueAt,
      overdue: dueAt != null && now > dueAt,
      lastDoneAt: lastAt,
      ...(aiReason ? { aiReason, aiUrgency } : {}),
    }
  })
}
