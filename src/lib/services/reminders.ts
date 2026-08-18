import { getConfig } from '@/lib/settings'
import { listPlants } from './plants'
import { getHaSensorMappings, getAllDeviceMappings, recordReading } from './sensors'
import { isConnected, publishDiscovery, publishCareStatus } from '@/lib/mqtt'
import { getState, getEntityRegistry, getDevicesWithSensors } from '@/lib/ha'

const DEVICE_CLASS_METRIC: Record<string, string> = { humidity: 'moisture', moisture: 'moisture', temperature: 'temperature' }

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

interface TopicMapping { plantId: number; topic: string; metric: string }

async function pollHaSensors() {
  const entityMappings = await getHaSensorMappings()
  const effective: TopicMapping[] = [...entityMappings]

  const deviceMap = getAllDeviceMappings()
  if (deviceMap.length > 0) {
    const deviceIds = [...new Set(deviceMap.map((d) => d.haDeviceId))]
    const deviceEntities = new Map<string, { plantId: number; deviceName: string | null }>()
    for (const d of deviceMap) deviceEntities.set(d.haDeviceId, { plantId: d.plantId, deviceName: d.deviceName })

    const [entityRegistry, devicesWithSensors] = await Promise.all([
      getEntityRegistry(),
      getDevicesWithSensors(),
    ])

    const stateMap = new Map(devicesWithSensors.flatMap((d) => d.sensors.map((s) => [s.entity_id, s])))

    for (const entity of entityRegistry) {
      if (!entity.device_id || !deviceEntities.has(entity.device_id)) continue
      const state = stateMap.get(entity.entity_id)
      const dc = state?.device_class
      const metric = dc ? DEVICE_CLASS_METRIC[dc] : null
      if (!metric) continue
      const { plantId } = deviceEntities.get(entity.device_id)!
      effective.push({ plantId, topic: entity.entity_id, metric })
    }
  }

  if (effective.length === 0) return
  for (const m of effective) {
    const state = await getState(m.topic)
    if (!state) continue
    const value = Number(state.state)
    if (Number.isNaN(value)) continue
    await recordReading(m.plantId, m.metric, value)
  }
}
