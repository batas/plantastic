import { desc, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { photos, plants, sensorReadings } from '@/lib/db/schema'
import { getNextCareDates, type CareStatus } from './plants'
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
}

export async function getDashboard() {
  const now = Date.now() / 1000
  const all = db.select().from(plants).orderBy(desc(plants.createdAt)).all()
  const tasks: DashboardTask[] = []
  const result: DashboardPlant[] = []
  for (const plant of all) {
    const [photo, readings] = await Promise.all([
      db.select().from(photos).where(eq(photos.plantId, plant.id)).orderBy(desc(photos.createdAt)).limit(1).get(),
      db
        .select()
        .from(sensorReadings)
        .where(eq(sensorReadings.plantId, plant.id))
        .orderBy(desc(sensorReadings.measuredAt))
        .all(),
    ])
    const latest: Record<string, number | null> = { moisture: null, temperature: null, light: null }
    for (const r of readings) {
      if (latest[r.metric] === null) latest[r.metric] = r.value
    }
    const care = (await getNextCareDates(plant.id)) ?? []
    for (const c of care) {
      if (c.dueAt && c.dueAt <= now + 24 * 3600) {
        tasks.push({
          plantId: plant.id,
          plantName: plant.name,
          type: c.type,
          dueAt: c.dueAt,
          overdue: c.overdue,
          lastDoneAt: c.lastDoneAt,
        })
      }
    }
    result.push({
      plant,
      photo: photo ?? null,
      care,
      moisture: latest.moisture,
      temperature: latest.temperature,
      light: latest.light,
    })
  }
  tasks.sort((a, b) => (a.overdue === b.overdue ? (a.dueAt ?? 0) - (b.dueAt ?? 0) : a.overdue ? -1 : 1))
  return { plants: result, tasks, now }
}

export { CARE_META }
