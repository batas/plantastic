import { and, eq, lt } from 'drizzle-orm'
import { db } from '@/lib/db'
import { sensorMappings, sensorReadings, deviceMappings } from '@/lib/db/schema'
import { publishSensorValue } from '@/lib/mqtt'

export async function getSensorMappings() {
  return db.select().from(sensorMappings).all()
}

export async function getHaSensorMappings() {
  return db.select().from(sensorMappings).where(eq(sensorMappings.source, 'ha')).all()
}

export async function listSensorMappings() {
  return db.select().from(sensorMappings).all()
}

export async function addSensorMapping(plantId: number, topic: string, metric: string, source: string = 'ha') {
  db.insert(sensorMappings).values({ plantId, topic, metric, source }).run()
}

export async function deleteSensorMapping(id: number) {
  db.delete(sensorMappings).where(eq(sensorMappings.id, id)).run()
}

export async function recordReading(plantId: number, metric: string, value: number) {
  db.insert(sensorReadings)
    .values({ plantId, metric, value, unit: metric === 'moisture' || metric === 'air_humidity' ? '%' : metric === 'temperature' ? '°C' : 'lx' })
    .run()
  const cutoff = Math.floor(Date.now() / 1000) - 30 * 86400
  db.delete(sensorReadings).where(and(eq(sensorReadings.plantId, plantId), eq(sensorReadings.metric, metric), lt(sensorReadings.measuredAt, cutoff))).run()
  publishSensorValue(plantId, metric, value)
}

export function getDeviceMappings(plantId: number) {
  return db.select().from(deviceMappings).where(eq(deviceMappings.plantId, plantId)).all()
}

export function getAllDeviceMappings() {
  return db.select().from(deviceMappings).all()
}

export function addDeviceMapping(plantId: number, haDeviceId: string, deviceName: string | null) {
  const existing = db.select().from(deviceMappings).where(and(eq(deviceMappings.plantId, plantId), eq(deviceMappings.haDeviceId, haDeviceId))).get()
  if (existing) return existing
  return db.insert(deviceMappings).values({ plantId, haDeviceId, deviceName }).returning().get()
}

export function deleteDeviceMapping(id: number) {
  db.delete(deviceMappings).where(eq(deviceMappings.id, id)).run()
}
