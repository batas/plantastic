import { getConfig } from '@/lib/settings'
import { getNextCareDates, listPlants } from './plants'
import { CARE_META } from '@/lib/care-types'
import { sendPersistentNotification } from '@/lib/ha'

/** Debounce: one notification per plant+kind per calendar day (process-local, resets on restart). */
const notifiedOn = new Map<string, string>()

function todayStr(): string {
  return new Date().toLocaleDateString('sv-SE')
}

export async function checkOverdueAndNotify(): Promise<void> {
  const cfg = getConfig()
  if (cfg.ha?.notifyEnabled === false) return
  if (!cfg.ha?.url || !cfg.ha?.token) return
  const minDays = Math.max(1, cfg.ha.notifyDaysOverdue ?? 1)
  const nowSec = Date.now() / 1000
  const today = todayStr()

  const plants = await listPlants()
  for (const plant of plants) {
    const statuses = await getNextCareDates(plant.id).catch(() => null)
    if (!statuses) continue
    for (const s of statuses) {
      if (!s.dueAt || !s.overdue) continue
      const daysOverdue = Math.floor((nowSec - s.dueAt) / 86400)
      if (daysOverdue < minDays) continue
      const key = `${plant.id}:${s.type}`
      if (notifiedOn.get(key) === today) continue

      const meta = CARE_META[s.type]
      const title = `🌿 ${plant.name}: ${meta.label} zaległe`
      const lines = [`${meta.icon} ${meta.label} jest zaległe od ${daysOverdue} ${daysOverdue === 1 ? 'dnia' : 'dni'}.`]
      if (s.aiReason) lines.push('', `🤖 AI: ${s.aiReason}`)
      const ok = await sendPersistentNotification(`plants_${plant.id}_${s.type}`, title, lines.join('\n'))
      if (ok) {
        notifiedOn.set(key, today)
        console.log(`[ha-notify] sent: ${title} (${daysOverdue}d overdue)`)
      }
    }
  }
}
