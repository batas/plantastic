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
  if (!url || !token) {
    console.warn('[ha] getStates: brak url lub tokena')
    return []
  }
  try {
    const res = await fetch(`${url.replace(/\/+$/, '')}/api/states`, {
      headers: getHeaders(token),
    })
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

export async function renderTemplate(template: string): Promise<string | null> {
  const cfg = getConfig()
  const url = cfg.ha?.url
  const token = cfg.ha?.token
  if (!url || !token) return null
  try {
    const res = await fetch(`${url.replace(/\/+$/, '')}/api/template`, {
      method: 'POST',
      headers: getHeaders(token),
      body: JSON.stringify({ template }),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      console.error(`[ha] renderTemplate: HTTP ${res.status}`, body.slice(0, 300))
      return null
    }
    return await res.text()
  } catch (err) {
    console.error('[ha] renderTemplate error:', err)
    return null
  }
}

const ALLOWED_SENSOR_CLASSES = new Set(['humidity', 'temperature'])

export interface HaDeviceWithSensors {
  device: { id: string; name: string }
  sensors: { entity_id: string; device_class: string | null; state: string; unit: string | null; friendly_name: string | null }[]
}

function groupSensorEntitiesByDevice(states: HaState[]): HaDeviceWithSensors[] {
  const sensors = states.filter(
    (s) =>
      s.entity_id.startsWith('sensor.') &&
      (s.attributes.device_class == null || ALLOWED_SENSOR_CLASSES.has(String(s.attributes.device_class))),
  )

  const byPrefix = new Map<string, HaDeviceWithSensors>()
  for (const s of sensors) {
    const entityId = s.entity_id.replace('sensor.', '')
    const parts = entityId.split('_')
    const deviceClass = s.attributes.device_class as string | undefined

    let prefix: string
    if (deviceClass && parts.length > 1 && parts[parts.length - 1] === deviceClass) {
      prefix = parts.slice(0, -1).join('_')
    } else if (parts.length >= 2) {
      prefix = parts.slice(0, -1).join('_')
    } else {
      prefix = entityId
    }

    const key = prefix.toLowerCase()
    if (!byPrefix.has(key)) {
      byPrefix.set(key, {
        device: { id: prefix, name: prefix.replace(/_/g, ' ') },
        sensors: [],
      })
    }
    byPrefix.get(key)!.sensors.push({
      entity_id: s.entity_id,
      device_class: (s.attributes.device_class as string) ?? null,
      state: s.state,
      unit: (s.attributes.unit_of_measurement as string) ?? null,
      friendly_name: (s.attributes.friendly_name as string) ?? null,
    })
  }

  return [...byPrefix.values()].filter((d) => d.sensors.length >= 2)
}

export async function getDevicesWithSensors(): Promise<HaDeviceWithSensors[]> {
  const states = await getStates('sensor')
  console.log(`[ha] getDevicesWithSensors: total sensor states=${states.length}`)

  const result = groupSensorEntitiesByDevice(states)
  console.log(`[ha] getDevicesWithSensors: grouped into ${result.length} devices`)
  return result
}
