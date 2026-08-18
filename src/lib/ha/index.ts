import { getConfig } from '@/lib/settings'

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

export async function getStates(domain?: string): Promise<HaState[]> {
  const cfg = getConfig()
  const url = cfg.ha?.url
  const token = cfg.ha?.token
  if (!url || !token) return []
  try {
    const res = await fetch(`${url.replace(/\/+$/, '')}/api/states`, {
      headers: getHeaders(token),
    })
    if (!res.ok) return []
    const states = (await res.json()) as HaState[]
    if (domain) return states.filter((s) => s.entity_id.startsWith(`${domain}.`))
    return states
  } catch {
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
  } catch {
    return null
  }
}

export interface HaDevice {
  id: string
  name: string | null
  manufacturer: string | null
  model: string | null
}

export interface HaEntityRegistryEntry {
  entity_id: string
  device_id: string | null
  device_class: string | null
  original_name: string | null
}

const ALLOWED_SENSOR_CLASSES = new Set(['humidity', 'temperature'])

export async function getDevices(): Promise<HaDevice[]> {
  const cfg = getConfig()
  const url = cfg.ha?.url
  const token = cfg.ha?.token
  if (!url || !token) return []
  try {
    const res = await fetch(`${url.replace(/\/+$/, '')}/api/config/device_registry/list`, {
      method: 'POST',
      headers: getHeaders(token),
      body: JSON.stringify({}),
    })
    if (!res.ok) return []
    return (await res.json()) as HaDevice[]
  } catch {
    return []
  }
}

export async function getEntityRegistry(): Promise<HaEntityRegistryEntry[]> {
  const cfg = getConfig()
  const url = cfg.ha?.url
  const token = cfg.ha?.token
  if (!url || !token) return []
  try {
    const res = await fetch(`${url.replace(/\/+$/, '')}/api/config/entity_registry/list`, {
      method: 'POST',
      headers: getHeaders(token),
      body: JSON.stringify({}),
    })
    if (!res.ok) return []
    return (await res.json()) as HaEntityRegistryEntry[]
  } catch {
    return []
  }
}

export interface HaDeviceWithSensors {
  device: HaDevice
  sensors: { entity_id: string; device_class: string | null; state: string; unit: string | null; friendly_name: string | null }[]
}

export async function getDevicesWithSensors(): Promise<HaDeviceWithSensors[]> {
  const [devices, entityRegistry, states] = await Promise.all([getDevices(), getEntityRegistry(), getStates('sensor')])

  const stateMap = new Map(states.map((s) => [s.entity_id, s]))

  const sensorEntities = entityRegistry.filter(
    (e) => e.entity_id.startsWith('sensor.') && e.device_id && (e.device_class == null || ALLOWED_SENSOR_CLASSES.has(e.device_class)),
  )

  const byDevice = new Map<string, HaDeviceWithSensors>()
  for (const entity of sensorEntities) {
    const state = stateMap.get(entity.entity_id)
    if (!state) continue
    const deviceId = entity.device_id!
    if (!byDevice.has(deviceId)) {
      const dev = devices.find((d) => d.id === deviceId)
      if (!dev) continue
      byDevice.set(deviceId, { device: dev, sensors: [] })
    }
    byDevice.get(deviceId)!.sensors.push({
      entity_id: entity.entity_id,
      device_class: entity.device_class,
      state: state.state,
      unit: (state.attributes.unit_of_measurement as string) ?? null,
      friendly_name: (state.attributes.friendly_name as string) ?? null,
    })
  }

  return [...byDevice.values()].filter((d) => d.sensors.length > 0)
}
