import { getConfig } from '@/lib/settings'
import { wsCommand } from './websocket'

export interface HaState {
  entity_id: string
  state: string
  attributes: Record<string, unknown>
  last_changed: string
  last_updated: string
}

function getHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  }
}

export async function testConnection(): Promise<{ ok: boolean; message: string }> {
  const cfg = getConfig()
  const url = cfg.ha?.url
  const token = cfg.ha?.token
  if (!url) return { ok: false, message: 'Brak adresu URL Home Assistant' }
  if (!token) return { ok: false, message: 'Brak tokena dostępu' }
  try {
    const res = await fetch(`${url.replace(/\/+$/, '')}/api/`, {
      headers: getHeaders(token),
    })
    if (!res.ok) return { ok: false, message: `HTTP ${res.status}` }
    const data = await res.json() as { message?: string }
    return { ok: true, message: data.message ?? 'Połączono' }
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) }
  }
}

export async function getStates(domain?: string): Promise<HaState[]> {  const cfg = getConfig()
  const url = cfg.ha?.url
  const token = cfg.ha?.token
  if (!url || !token) {
    console.warn('[ha] getStates: brak url lub tokena')
    return []
  }
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10000)
    const res = await fetch(`${url.replace(/\/+$/, '')}/api/states`, {
      headers: getHeaders(token),
      signal: controller.signal,
    })
    clearTimeout(timeout)
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      console.error(`[ha] getStates: HTTP ${res.status}`, body.slice(0, 200))
      return []
    }
    const states = (await res.json()) as HaState[]
    if (domain) return states.filter((s) => s.entity_id.startsWith(`${domain}.`))
    return states
  } catch (err) {
    console.error('[ha] getStates error:', err)
    return []
  }
}

export async function getState(entityId: string): Promise<HaState | null> {
  const cfg = getConfig()
  const url = cfg.ha?.url
  const token = cfg.ha?.token
  if (!url || !token) return null
  try {
    const res = await fetch(`${url.replace(/\/+$/, '')}/api/states/${encodeURIComponent(entityId)}`, {
      headers: getHeaders(token),
    })
    if (!res.ok) return null
    return (await res.json()) as HaState
  } catch (err) {
    console.error('[ha] getState error:', entityId, err)
    return null
  }
}

/** Call a HA service over REST, e.g. callHaService('todo', 'add_item', {...}). */
export async function callHaService(domain: string, service: string, data: Record<string, unknown>): Promise<boolean> {
  const cfg = getConfig()
  const url = cfg.ha?.url
  const token = cfg.ha?.token
  if (!url || !token) {
    console.warn('[ha] callHaService: brak url lub tokena')
    return false
  }
  try {
    const res = await fetch(`${url.replace(/\/+$/, '')}/api/services/${domain}/${service}`, {
      method: 'POST',
      headers: getHeaders(token),
      body: JSON.stringify(data),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      console.error(`[ha] callHaService ${domain}.${service}: HTTP ${res.status}`, body.slice(0, 200))
      return false
    }
    return true
  } catch (err) {
    console.error(`[ha] callHaService ${domain}.${service} error:`, err)
    return false
  }
}

/** Create (or replace) a HA persistent notification. */
export async function sendPersistentNotification(notificationId: string, title: string, message: string): Promise<boolean> {
  return callHaService('persistent_notification', 'create', {
    notification_id: notificationId,
    title,
    message,
  })
}

export interface HaDevice {
  id: string
  name: string | null
  manufacturer: string | null
  model: string | null
  area_id: string | null
  area_name?: string | null
}

export interface HaArea {
  area_id: string
  name: string
}

export interface HaEntityRegistryEntry {
  entity_id: string
  device_id: string | null
  disabled_by: string | null
  area_id: string | null
}

const ALLOWED_SENSOR_CLASSES = new Set(['humidity', 'temperature', 'moisture'])

export async function getDevices(): Promise<HaDevice[]> {
  try {
    const devices = await wsCommand<HaDevice[]>('config/device_registry/list')
    console.log(`[ha] getDevices: ${devices.length} devices`)
    return devices
  } catch (err) {
    console.error('[ha] getDevices WS error:', err)
    return []
  }
}

export async function getAreas(): Promise<HaArea[]> {
  try {
    const areas = await wsCommand<HaArea[]>('config/area_registry/list')
    console.log(`[ha] getAreas: ${areas.length} areas`)
    return areas
  } catch (err) {
    console.error('[ha] getAreas WS error:', err)
    return []
  }
}

export async function getEntityRegistry(): Promise<HaEntityRegistryEntry[]> {
  try {
    const entities = await wsCommand<HaEntityRegistryEntry[]>('config/entity_registry/list')
    console.log(`[ha] getEntityRegistry: ${entities.length} entities`)
    return entities
  } catch (err) {
    console.error('[ha] getEntityRegistry WS error:', err)
    return []
  }
}

export async function fetchPlantAreasFromHa(): Promise<Map<number, string>> {
  const result = new Map<number, string>()
  try {
    const [devices, areas] = await Promise.all([
      wsCommand<Array<{ identifiers?: string[][]; area_id: string | null }>>('config/device_registry/list'),
      getAreas(),
    ])
    const areaNames = new Map(areas.map((a) => [a.area_id, a.name]))
    for (const d of devices) {
      for (const ids of d.identifiers ?? []) {
        for (const idf of ids) {
          const m = /^plants_plant_(\d+)$/.exec(idf)
          if (m && d.area_id) {
            const name = areaNames.get(d.area_id)
            if (name) result.set(Number(m[1]), name)
          }
        }
      }
    }
    console.log(`[ha] fetchPlantAreasFromHa: ${result.size} plants with area`)
  } catch (err) {
    console.error('[ha] fetchPlantAreasFromHa error:', err instanceof Error ? err.message : err)
  }
  return result
}

export interface HaDeviceWithSensors {
  device: HaDevice
  sensors: { entity_id: string; device_class: string | null; state: string; unit: string | null; friendly_name: string | null }[]
}

export async function getDevicesWithSensors(): Promise<HaDeviceWithSensors[]> {
  const [devices, entityRegistry, states, areas] = await Promise.all([
    getDevices(),
    getEntityRegistry(),
    getStates('sensor'),
    getAreas(),
  ])

  console.log(`[ha] getDevicesWithSensors: devices=${devices.length} entityRegistry=${entityRegistry.length} states=${states.length} areas=${areas.length}`)

  const stateMap = new Map(states.map((s) => [s.entity_id, s]))
  const areaMap = new Map(areas.map((a) => [a.area_id, a.name]))

  const sensorEntities = entityRegistry.filter(
    (e) =>
      e.entity_id.startsWith('sensor.') &&
      (e.disabled_by == null) &&
      (() => {
        const dc = stateMap.get(e.entity_id)?.attributes.device_class
        return dc == null || ALLOWED_SENSOR_CLASSES.has(String(dc))
      })(),
  )

  console.log(`[ha] getDevicesWithSensors: sensorEntities (with device_id) =${sensorEntities.filter(e => e.device_id).length}, without device_id=${sensorEntities.filter(e => !e.device_id).length}`)

  // Group by device_id
  const byDevice = new Map<string, HaDeviceWithSensors>()
  for (const entity of sensorEntities) {
    if (!entity.device_id) continue
    const state = stateMap.get(entity.entity_id)
    if (!state) continue
    const deviceId = entity.device_id
    if (!byDevice.has(deviceId)) {
      const dev = devices.find((d) => d.id === deviceId)
      if (!dev) continue
      byDevice.set(deviceId, {
        device: { ...dev, area_name: dev.area_id ? areaMap.get(dev.area_id) ?? null : null },
        sensors: [],
      })
    }
    byDevice.get(deviceId)!.sensors.push({
      entity_id: entity.entity_id,
      device_class: (state.attributes.device_class as string) ?? null,
      state: state.state,
      unit: (state.attributes.unit_of_measurement as string) ?? null,
      friendly_name: (state.attributes.friendly_name as string) ?? null,
    })
  }

  // Also include standalone sensors (no device_id) as individual entries
  for (const entity of sensorEntities) {
    if (entity.device_id) continue
    const state = stateMap.get(entity.entity_id)
    if (!state) continue
    const areaId = entity.area_id
    const areaName = areaId ? (areaMap.get(areaId) ?? null) : null
    // Create a virtual "device" from the entity name
    const friendlyName = (state.attributes.friendly_name as string) ?? entity.entity_id
    const virtualId = `standalone:${entity.entity_id}`
    if (!byDevice.has(virtualId)) {
      byDevice.set(virtualId, {
        device: { id: virtualId, name: friendlyName, manufacturer: null, model: null, area_id: areaId, area_name: areaName },
        sensors: [],
      })
    }
    byDevice.get(virtualId)!.sensors.push({
      entity_id: entity.entity_id,
      device_class: (state.attributes.device_class as string) ?? null,
      state: state.state,
      unit: (state.attributes.unit_of_measurement as string) ?? null,
      friendly_name: friendlyName,
    })
  }

  const result = [...byDevice.values()].filter((d) => d.sensors.length > 0)
  console.log(`[ha] getDevicesWithSensors: result devices with sensors=${result.length}`)
  return result
}
