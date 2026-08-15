import mqtt, { type MqttClient, type IClientOptions } from 'mqtt'
import { getConfig } from '@/lib/settings'
import { getPlant, getNextCareDates } from '@/lib/services/plants'
import { getSensorMappings } from '@/lib/services/sensors'
import { CARE_TYPES } from '@/lib/care-types'

let client: MqttClient | null = null
let statusListeners: Array<(connected: boolean) => void> = []
const subscribed = new Set<string>()
const lastPublish: Record<string, number> = {}

export function isConnected() {
  return client?.connected ?? false
}

export function onStatusChange(fn: (connected: boolean) => void) {
  statusListeners.push(fn)
  return () => {
    statusListeners = statusListeners.filter((f) => f !== fn)
  }
}

function emitStatus() {
  const connected = isConnected()
  for (const fn of statusListeners) fn(connected)
}

function stripPrefix(topic: string): string {
  const parts = topic.split('/')
  let idx = 0
  while (idx < parts.length && parts[idx] === '#') idx++
  return parts.slice(idx).join('/')
}

export async function connectMqtt() {
  const cfg = getConfig()
  const { host, port, user, password } = cfg.mqtt ?? {}
  if (!host) {
    console.warn('[mqtt] brak konfiguracji hosta')
    return
  }
  if (client) {
    client.end(true)
    client = null
  }
  const url = `mqtt://${host}:${port ?? 1883}`
  const opts: IClientOptions = { clientId: `plants-${Math.random().toString(16).slice(2, 8)}` }
  if (user) opts.username = user
  if (password) opts.password = password
  client = mqtt.connect(url, opts)

  client.on('connect', async () => {
    console.log('[mqtt] connected')
    emitStatus()
    await refreshSubscriptions()
  })
  client.on('close', () => {
    emitStatus()
  })
  client.on('error', (err) => console.error('[mqtt] error', err.message))
  client.on('message', async (topic, payload) => {
    const { recordReading } = await import('@/lib/services/sensors')
    const text = payload.toString()
    const value = Number(text)
    if (Number.isNaN(value)) return
    const mappings = await getSensorMappings()
    const match = mappings.find((m) => topic === stripPrefix(m.topic) || topic.includes(stripPrefix(m.topic)))
    if (match) {
      await recordReading(match.plantId, match.metric, value)
    }
  })
}

export async function refreshSubscriptions() {
  if (!client?.connected) return
  const mappings = await getSensorMappings()
  const wanted = new Set(mappings.map((m) => stripPrefix(m.topic)))
  for (const t of wanted) {
    if (!subscribed.has(t)) {
      client.subscribe(t, (err) => err && console.error('[mqtt] subscribe err', t, err.message))
      subscribed.add(t)
    }
  }
  for (const t of subscribed) {
    if (!wanted.has(t)) {
      client.unsubscribe(t)
      subscribed.delete(t)
    }
  }
}

function slugify(s: string) {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
}

function publish(topic: string, value: string, opts?: { retain?: boolean; force?: boolean }) {
  if (!client?.connected) return
  const now = Date.now()
  const key = `${topic}=${value}`
  if (!opts?.force && lastPublish[key] && now - lastPublish[key] < 5000) return
  lastPublish[key] = now
  client.publish(topic, value, { retain: opts?.retain ?? true })
}

export function publishSensorValue(plantId: number, metric: string, value: number) {
  publish(`home/plants/${plantId}/${metric}`, String(value))
}

export async function publishWatered(plantId: number) {
  const plant = await getPlant(plantId)
  if (!plant) return
  publish(`home/plants/${plantId}/last_watered`, String(Math.floor(Date.now() / 1000)), { force: true })
}

export async function publishCareStatus(plantId: number) {
  const statuses = await getNextCareDates(plantId)
  if (!statuses) return
  for (const s of statuses) {
    const due = s.dueAt ? s.dueAt <= Date.now() / 1000 : false
    publish(`home/plants/${plantId}/${s.type}_due`, due ? 'ON' : 'OFF', { force: true })
  }
}

export async function publishDiscovery(plantId: number) {
  if (!client?.connected) return
  const plant = await getPlant(plantId)
  if (!plant) return
  const objId = `plant_${plantId}`
  const name = slugify(plant.name) || `plant${plantId}`
  const mk = (component: string, suffix: string, cfg: Record<string, unknown>) =>
    client!.publish(`homeassistant/${component}/${objId}_${suffix}/config`, JSON.stringify(cfg), { retain: true })

  mk('sensor', 'last_watered', {
    name: `${plant.name} ostatnie podlewanie`,
    unique_id: `plants_${objId}_last_watered`,
    state_topic: `home/plants/${plantId}/last_watered`,
    device_class: 'timestamp',
    value_template: '{{ (value | int) | timestamp_local }}',
  })
  mk('sensor', 'moisture', {
    name: `${plant.name} wilgotność`,
    unique_id: `plants_${objId}_moisture`,
    state_topic: `home/plants/${plantId}/moisture`,
    unit_of_measurement: '%',
  })
  mk('sensor', 'temperature', {
    name: `${plant.name} temperatura`,
    unique_id: `plants_${objId}_temperature`,
    state_topic: `home/plants/${plantId}/temperature`,
    device_class: 'temperature',
    unit_of_measurement: '°C',
  })
  mk('sensor', 'light', {
    name: `${plant.name} światło`,
    unique_id: `plants_${objId}_light`,
    state_topic: `home/plants/${plantId}/light`,
    unit_of_measurement: 'lx',
  })
  for (const type of CARE_TYPES) {
    mk('binary_sensor', `${type}_due`, {
      name: `${plant.name} ${type}`,
      unique_id: `plants_${objId}_${type}_due`,
      state_topic: `home/plants/${plantId}/${type}_due`,
      payload_on: 'ON',
      payload_off: 'OFF',
      device_class: type === 'water' ? 'problem' : undefined,
    })
  }
  void name
}
