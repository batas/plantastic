import { getConfig } from '@/lib/settings'
import { listPlants } from './plants'
import { getHaSensorMappings, recordReading } from './sensors'
import { isConnected, publishDiscovery, publishCareStatus } from '@/lib/mqtt'
import { getState } from '@/lib/ha'

let started = false

export function runReminderWorker() {
  if (started) return
  started = true
  const interval = setInterval(
    async () => {
      try {
        if (isConnected()) {
          const cfg = getConfig()
          if (cfg.reminderEnabled !== false) {
            const plants = await listPlants()
            for (const p of plants) {
              publishDiscovery(p.id)
              await publishCareStatus(p.id)
            }
          }
        }
        await pollHaSensors()
      } catch (err) {
        console.error('[reminders]', err)
      }
    },
    60 * 1000,
  )
  interval.unref()
}

async function pollHaSensors() {
  const mappings = await getHaSensorMappings()
  if (mappings.length === 0) return
  for (const m of mappings) {
    const state = await getState(m.topic)
    if (!state) continue
    const value = Number(state.state)
    if (Number.isNaN(value)) continue
    await recordReading(m.plantId, m.metric, value)
  }
}
