import { and, desc, inArray, isNull, max, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { careLogs, careOverrides, photos, plants, sensorReadings } from '@/lib/db/schema'
import { buildCareStatuses, type CareStatus } from './plants'
import { CARE_META, type CareType } from '@/lib/care-types'

export interface DashboardPlant {
  plant: typeof plants.$inferSelect
  photo: (typeof photos.$inferSelect) | null
  care: CareStatus[]
  moisture: number | null
  temperature: number | null
  light: number | null
}

export interface DashboardTask {
  plantId: number
  plantName: string
  type: CareType
  dueAt: number | null
  overdue: boolean
  lastDoneAt: number | null
  aiReason?: string
  aiUrgency?: 'high' | 'medium' | 'low'
}

/** One row per (plant, metric) — the most recent reading, without loading full history. */
function latestReadingPerMetric(plantIds: number[]) {
  return db
    .select({
      plantId: sensorReadings.plantId,
      metric: sensorReadings.metric,
      value: sensorReadings.value,
    })
    .from(sensorReadings)
    .where(
      and(
        inArray(sensorReadings.plantId, plantIds),
        sql`${sensorReadings.id} IN (
          SELECT s2.id FROM sensor_readings s2
          WHERE s2.plant_id = ${sensorReadings.plantId} AND s2.metric = ${sensorReadings.metric}
          ORDER BY s2.measured_at DESC LIMIT 1
        )`,
      ),
    )
    .all()
}

export async function getDashboard() {
  const now = Date.now() / 1000
  const all = db.select().from(plants).orderBy(desc(plants.createdAt)).all()
  if (all.length === 0) return { plants: [], tasks: [] as DashboardTask[], now }
  const ids = all.map((p) => p.id)

  const [latestPhotos, readings, lastCareRows, overrides] = await Promise.all([
    db.select().from(photos).where(inArray(photos.plantId, ids)).orderBy(desc(photos.createdAt)).all(),
    Promise.resolve(latestReadingPerMetric(ids)),
    Promise.resolve(
      db
        .select({ plantId: careLogs.plantId, kind: careLogs.kind, lastAt: max(careLogs.createdAt) })
        .from(careLogs)
        .where(inArray(careLogs.plantId, ids))
        .groupBy(careLogs.plantId, careLogs.kind)
        .all(),
    ),
    Promise.resolve(db.select().from(careOverrides).where(isNull(careOverrides.resolvedAt)).all()),
  ])

  const photoByPlant = new Map<number, (typeof photos.$inferSelect)>()
  for (const p of latestPhotos) if (!photoByPlant.has(p.plantId)) photoByPlant.set(p.plantId, p)

  const readingByPlantMetric = new Map<string, number>()
  for (const r of readings) readingByPlantMetric.set(`${r.plantId}:${r.metric}`, r.value)

  const lastCareByPlant = new Map<number, Map<string, number | null>>()
  for (const r of lastCareRows) {
    if (!lastCareByPlant.has(r.plantId)) lastCareByPlant.set(r.plantId, new Map())
    lastCareByPlant.get(r.plantId)!.set(r.kind as string, Number(r.lastAt))
  }

  const overridesByPlant = new Map<number, typeof overrides>()
  for (const o of overrides) {
    if (!overridesByPlant.has(o.plantId)) overridesByPlant.set(o.plantId, [])
    overridesByPlant.get(o.plantId)!.push(o)
  }

  const tasks: DashboardTask[] = []
  const result: DashboardPlant[] = []
  for (const plant of all) {
    const latest = {
      moisture: readingByPlantMetric.get(`${plant.id}:moisture`) ?? null,
      temperature: readingByPlantMetric.get(`${plant.id}:temperature`) ?? null,
      light: readingByPlantMetric.get(`${plant.id}:light`) ?? null,
    }
    const care = buildCareStatuses(plant, lastCareByPlant.get(plant.id) ?? new Map(), overridesByPlant.get(plant.id))
    for (const c of care) {
      if (c.dueAt && c.dueAt <= now + 24 * 3600) {
        tasks.push({
          plantId: plant.id,
          plantName: plant.name,
          type: c.type,
          dueAt: c.dueAt,
          overdue: c.overdue,
          lastDoneAt: c.lastDoneAt,
          ...(c.aiReason ? { aiReason: c.aiReason, aiUrgency: c.aiUrgency } : {}),
        })
      }
    }
    result.push({ plant, photo: photoByPlant.get(plant.id) ?? null, care, ...latest })
  }
  tasks.sort((a, b) => (a.overdue === b.overdue ? (a.dueAt ?? 0) - (b.dueAt ?? 0) : a.overdue ? -1 : 1))
  return { plants: result, tasks, now }
}

export { CARE_META }
