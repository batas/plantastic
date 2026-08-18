import mqtt, { type MqttClient, type IClientOptions } from 'mqtt'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { desc, eq } from 'drizzle-orm'
import { getConfig, getPhotosDir, maskSecret } from '@/lib/settings'
import { db } from '@/lib/db'
import { photos } from '@/lib/db/schema'
import { getPlant, getNextCareDates } from '@/lib/services/plants'
import { logCare, normalizeCareKind } from '@/lib/services/care'
import { CARE_TYPES, CARE_META, type CareType } from '@/lib/care-types'

const g = globalThis as unknown as { __mqttClient?: MqttClient | null; __mqttListeners?: Array<(connected: boolean) => void>; __mqttSubscribed?: Set<string>; __mqttLastPublish?: Record<string, number> }
if (!g.__mqttClient) g.__mqttClient = null
if (!g.__mqttListeners) g.__mqttListeners = []
if (!g.__mqttSubscribed) g.__mqttSubscribed = new Set()
if (!g.__mqttLastPublish) g.__mqttLastPublish = {}

let statusListeners: Array<(connected: boolean) => void> = g.__mqttListeners!
const subscribed: Set<string> = g.__mqttSubscribed!
const lastPublish: Record<string, number> = g.__mqttLastPublish!

function getClient(): MqttClient | null { return g.__mqttClient ?? null }
function setClient(c: MqttClient | null) { g.__mqttClient = c }

export function isConnected() {
  return getClient()?.connected ?? false
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

export async function connectMqtt() {
  const cfg = getConfig()
  const { host, port, user, password } = cfg.mqtt ?? {}

  if (!host) {
    console.warn('[mqtt] brak konfiguracji hosta')
    return
  }
  if (!user && !password) {
    console.warn('[mqtt] brak credentials — połączenie może się nie udać')
  }
  if (getClient()) {
    getClient()!.end(true)
    setClient(null)
  }
  const url = `mqtt://${host}:${port ?? 1883}`
  console.log(`[mqtt] connecting: url=${url} user=${user ?? '(brak)'} password=${maskSecret(password)}`)
  const opts: IClientOptions = { clientId: `plants-${Math.random().toString(16).slice(2, 8)}` }
  if (user) opts.username = user
  if (password) opts.password = password
  setClient(mqtt.connect(url, opts))

  getClient()!.on('connect', async () => {
    console.log('[mqtt] connected')
    emitStatus()
    await refreshSubscriptions()
  })
  getClient()!.on('close', () => {
    console.log('[mqtt] disconnected')
    emitStatus()
  })
  getClient()!.on('offline', () => {
    console.log('[mqtt] offline')
  })
  getClient()!.on('error', (err) => console.error('[mqtt] error:', err.message))
  getClient()!.on('message', async (topic, payload) => {
    const text = payload.toString()

    const cmdMatch = topic.match(/^home\/plants\/(\d+)\/cmd$/)
    if (cmdMatch) {
      const plantId = Number(cmdMatch[1])
      const kind = normalizeCareKind(text.trim().toLowerCase())
      if (kind) {
        console.log(`[mqtt] cmd: plant=${plantId} kind=${kind}`)
        await logCare(plantId, kind)
        await publishCareStatus(plantId)
        await publishLastCare(plantId, kind)
        if (kind === 'water') await publishWatered(plantId)
      }
      return
    }
  })
}

export async function refreshSubscriptions() {
  if (!getClient()?.connected) return
  const wanted = new Set<string>()
  wanted.add('home/plants/+/cmd')
  for (const t of wanted) {
    if (!subscribed.has(t)) {
      getClient()!.subscribe(t, (err) => err && console.error('[mqtt] subscribe err', t, err.message))
      subscribed.add(t)
    }
  }
  for (const t of subscribed) {
    if (!wanted.has(t)) {
      getClient()!.unsubscribe(t)
      subscribed.delete(t)
    }
  }
}

function publish(topic: string, value: string, opts?: { retain?: boolean; force?: boolean }) {
  if (!getClient()?.connected) return
  const now = Date.now()
  const key = `${topic}=${value}`
  if (!opts?.force && lastPublish[key] && now - lastPublish[key] < 5000) return
  lastPublish[key] = now
  getClient()!.publish(topic, value, { retain: opts?.retain ?? true })
}

export function publishSensorValue(plantId: number, metric: string, value: number) {
  publish(`home/plants/${plantId}/${metric}`, String(value))
}

export async function publishWatered(plantId: number) {
  const plant = await getPlant(plantId)
  if (!plant) return
  publish(`home/plants/${plantId}/last_watered`, String(Math.floor(Date.now() / 1000)), { force: true })
}

const LAST_CARE_LABELS: Record<string, string> = {
  water: 'ostatnie podlewanie',
  fertilize: 'ostatnie nawożenie',
  mist: 'ostatnie zraszanie',
  clean: 'ostatnie czyszczenie',
  rotate: 'ostatnie obracanie',
}

export async function publishLastCare(plantId: number, kind: CareType) {
  publish(`home/plants/${plantId}/last_${kind}`, String(Math.floor(Date.now() / 1000)), { force: true })
}

export async function publishPhoto(plantId: number) {
  const c = getClient()
  if (!c?.connected) return
  const row = db.select().from(photos).where(eq(photos.plantId, plantId)).orderBy(desc(photos.createdAt)).limit(1).get()
  if (!row) return
  const dir = getPhotosDir()
  const filePath = path.join(dir, row.thumbPath ?? row.path)
  try {
    const buf = readFileSync(filePath)
    c.publish(`home/plants/${plantId}/photo`, buf, { retain: true })
  } catch (err) {
    console.error('[mqtt] photo read error:', filePath, err)
  }
}

export async function publishCareStatus(plantId: number) {
  const statuses = await getNextCareDates(plantId)
  if (!statuses) return
  for (const s of statuses) {
    const due = s.dueAt ? s.dueAt <= Date.now() / 1000 : false
    publish(`home/plants/${plantId}/${s.type}_due`, due ? 'ON' : 'OFF', { force: true })
  }
}

export function listMqttTopics(): Promise<{ topic: string; value: string }[]> {
  return new Promise((resolve) => {
    const c = getClient()
    if (!c?.connected) {
      resolve([])
      return
    }
    const topics = new Map<string, string>()
    const handler = (topic: string, payload: Buffer) => {
      topics.set(topic, payload.toString())
    }
    c.on('message', handler)
    c.subscribe('#', (err) => {
      if (err) {
        c.off('message', handler)
        resolve([])
        return
      }
      setTimeout(() => {
        c.unsubscribe('#')
        c.off('message', handler)
        resolve([...topics.entries()].map(([topic, value]) => ({ topic, value })).sort((a, b) => a.topic.localeCompare(b.topic)))
      }, 2000)
    })
  })
}

export async function publishDiscovery(plantId: number) {
  const c = getClient()
  if (!c?.connected) return
  const plant = await getPlant(plantId)
  if (!plant) return
  const objId = `plant_${plantId}`
  const device = {
    identifiers: [`plants_${objId}`],
    name: plant.name,
    manufacturer: 'Plantastic',
    model: 'Roślina',
  }
  const mk = (component: string, suffix: string, cfg: Record<string, unknown>) =>
    c.publish(`homeassistant/${component}/${objId}_${suffix}/config`, JSON.stringify(cfg), { retain: true })

  mk('camera', 'photo', {
    name: `${plant.name} zdjęcie`,
    unique_id: `plants_${objId}_photo`,
    topic: `home/plants/${plantId}/photo`,
    device,
  })

  mk('sensor', 'last_watered', {
    name: `${plant.name} ostatnie podlewanie`,
    unique_id: `plants_${objId}_last_watered`,
    state_topic: `home/plants/${plantId}/last_watered`,
    device_class: 'timestamp',
    value_template: '{{ (value | int) | timestamp_local }}',
    device,
  })

  for (const type of CARE_TYPES) {
    if (type === 'water') continue
    mk('sensor', `last_${type}`, {
      name: `${plant.name} ${LAST_CARE_LABELS[type]}`,
      unique_id: `plants_${objId}_last_${type}`,
      state_topic: `home/plants/${plantId}/last_${type}`,
      device_class: 'timestamp',
      value_template: '{{ (value | int) | timestamp_local }}',
      device,
    })
  }

  mk('sensor', 'moisture', {
    name: `${plant.name} wilgotność`,
    unique_id: `plants_${objId}_moisture`,
    state_topic: `home/plants/${plantId}/moisture`,
    unit_of_measurement: '%',
    device,
  })
  mk('sensor', 'temperature', {
    name: `${plant.name} temperatura`,
    unique_id: `plants_${objId}_temperature`,
    state_topic: `home/plants/${plantId}/temperature`,
    device_class: 'temperature',
    unit_of_measurement: '°C',
    device,
  })
  mk('sensor', 'light', {
    name: `${plant.name} światło`,
    unique_id: `plants_${objId}_light`,
    state_topic: `home/plants/${plantId}/light`,
    unit_of_measurement: 'lx',
    device,
  })

  if (plant.species) {
    mk('sensor', 'species', {
      name: `${plant.name} gatunek`,
      unique_id: `plants_${objId}_species`,
      state_topic: `home/plants/${plantId}/species`,
      entity_category: 'diagnostic',
      device,
    })
    publish(`home/plants/${plantId}/species`, plant.species)
  }
  if (plant.location) {
    mk('sensor', 'location', {
      name: `${plant.name} lokalizacja`,
      unique_id: `plants_${objId}_location`,
      state_topic: `home/plants/${plantId}/location`,
      entity_category: 'config',
      device,
    })
    publish(`home/plants/${plantId}/location`, plant.location)
  }
  if (plant.notes) {
    mk('sensor', 'notes', {
      name: `${plant.name} notatki`,
      unique_id: `plants_${objId}_notes`,
      state_topic: `home/plants/${plantId}/notes`,
      entity_category: 'diagnostic',
      device,
    })
    publish(`home/plants/${plantId}/notes`, plant.notes)
  }

  for (const type of CARE_TYPES) {
    mk('binary_sensor', `${type}_due`, {
      name: `${plant.name} ${CARE_META[type].label}`,
      unique_id: `plants_${objId}_${type}_due`,
      state_topic: `home/plants/${plantId}/${type}_due`,
      payload_on: 'ON',
      payload_off: 'OFF',
      device_class: type === 'water' ? 'problem' : undefined,
      device,
    })
  }

  await publishPhoto(plantId)
}
