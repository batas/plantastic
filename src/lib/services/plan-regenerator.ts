import { desc, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { plants, timelineEntries } from '@/lib/db/schema'
import { createTask } from './tasks'
import { processTask } from './task-processors'

const CHECK_INTERVAL_MS = 60 * 60 * 1000
const STARTUP_DELAY_MS = 3 * 60 * 1000

export function startPlanRegenerator() {
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
    await regenerateDuePlans()
  } catch (err) {
    console.error('[planRegenerator]', err)
  }
}

async function regenerateDuePlans() {
  const now = Math.floor(Date.now() / 1000)
  const allPlants = db.select().from(plants).all()

  // Filter to plants where carePlanDays is set (not null, > 0)
  const enabled = allPlants.filter((p) => p.carePlanDays != null && p.carePlanDays > 0)
  if (enabled.length === 0) {
    console.log(`[planRegenerator] brak roślin z włączonym auto-planem (carePlanDays)`)
    return
  }

  console.log(`[planRegenerator] checking ${enabled.length} plants`)

  let generated = 0
  for (const plant of enabled) {
    const days = plant.carePlanDays!
    const cutoff = now - days * 86400

    // Find most recent care_plan entry
    const lastPlan = db
      .select()
      .from(timelineEntries)
      .where(
        eq(timelineEntries.plantId, plant.id),
      )
      .orderBy(desc(timelineEntries.createdAt))
      .all()
      .find((e) => e.kind === 'care_plan')

    // If no plan exists or last plan is older than carePlanDays, regenerate
    if (lastPlan && lastPlan.createdAt > cutoff) continue

    console.log(`[planRegenerator] generating plan for "${plant.name}" (last: ${lastPlan ? new Date(lastPlan.createdAt * 1000).toISOString() : 'never'})`)

    try {
      const task = createTask('care_plan', plant.id)
      await processTask(task.id, 'care_plan', plant.id)
      generated++
    } catch (err) {
      console.error(`[planRegenerator] failed for plant ${plant.id}:`, err)
    }
  }

  if (generated > 0) {
    console.log(`[planRegenerator] generated ${generated} care plans`)
  }
}
