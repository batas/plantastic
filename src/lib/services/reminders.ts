import { getConfig } from '@/lib/settings'
import { listPlants } from './plants'
import { isConnected, publishDiscovery, publishCareStatus } from '@/lib/mqtt'

let started = false

export function runReminderWorker() {
  if (started) return
  started = true
  const interval = setInterval(
    async () => {
      if (!isConnected()) return
      const cfg = getConfig()
      if (!cfg.reminderEnabled) return
      try {
        const plants = await listPlants()
        for (const p of plants) {
          publishDiscovery(p.id)
          await publishCareStatus(p.id)
        }
      } catch (err) {
        console.error('[reminders]', err)
      }
    },
    60 * 1000,
  )
  interval.unref()
}
