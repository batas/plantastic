import { and, desc, eq, gt } from 'drizzle-orm'
import { db } from '@/lib/db'
import { asyncTasks, plants } from '@/lib/db/schema'
import { createTask } from './tasks'
import { processTask } from './task-processors'

const CHECK_INTERVAL_MS = 60 * 60 * 1000
const STARTUP_DELAY_MS = 3 * 60 * 1000
const PER_PLANT_COOLDOWN_S = 24 * 60 * 60

export function startSensorCheckScheduler() {
  const initial = setTimeout(() => {
    void tick()
  }, STARTUP_DELAY_MS)
  initial.unref()
  setInterval(() => {
    void tick()
  }, CHECK_INTERVAL_MS).unref()
}

async function tick() {
  try {
    await runSensorChecks()
  } catch (err) {
    console.error('[sensorCheckScheduler]', err)
  }
}

function checkedRecently(plantId: number): boolean {
  const cutoff = Math.floor(Date.now() / 1000) - PER_PLANT_COOLDOWN_S
  const rows = db
    .select({ id: asyncTasks.id })
    .from(asyncTasks)
    .where(
      and(
        eq(asyncTasks.plantId, plantId),
        eq(asyncTasks.type, 'sensor_check'),
        gt(asyncTasks.createdAt, cutoff),
      ),
    )
    .orderBy(desc(asyncTasks.createdAt))
    .limit(1)
    .all()
  return rows.length > 0
}

async function runSensorChecks() {
  const enabled = db.select().from(plants).where(eq(plants.sensorCheck, true)).all()
  if (enabled.length === 0) {
    console.log(`[sensorCheck] brak roślin z włączonymi przypomnieniami sensorowymi`)
    return
  }

  console.log(`[sensorCheck] running checks for ${enabled.length} plants`)

  let checked = 0
  for (const plant of enabled) {
    if (checkedRecently(plant.id)) continue
    try {
      const task = createTask('sensor_check', plant.id)
      await processTask(task.id, 'sensor_check', plant.id)
      checked++
    } catch (err) {
      console.error(`[sensorCheck] failed for plant ${plant.id}:`, err)
    }
  }

  if (checked > 0) {
    console.log(`[sensorCheck] completed ${checked} sensor checks`)
  }
}
