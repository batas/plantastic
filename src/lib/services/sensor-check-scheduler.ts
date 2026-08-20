import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { plants } from '@/lib/db/schema'
import { createTask } from './tasks'
import { processTask } from './task-processors'

const CHECK_INTERVAL_MS = 60 * 60 * 1000 // check every hour
const DAILY_CHECK_MS = 24 * 60 * 60 * 1000 // but only process once per day

let lastRun = 0

export function startSensorCheckScheduler() {
  setInterval(async () => {
    try {
      const now = Date.now()
      if (now - lastRun < DAILY_CHECK_MS) return
      lastRun = now
      await runSensorChecks()
    } catch (err) {
      console.error('[sensorCheckScheduler]', err)
    }
  }, CHECK_INTERVAL_MS).unref()
}

async function runSensorChecks() {
  const enabled = db.select().from(plants).where(eq(plants.sensorCheck, true)).all()
  if (enabled.length === 0) return

  console.log(`[sensorCheck] running checks for ${enabled.length} plants`)

  let checked = 0
  for (const plant of enabled) {
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
