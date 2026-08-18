import { and, eq, lt } from 'drizzle-orm'
import { db } from '@/lib/db'
import { sensorMappings, sensorReadings } from '@/lib/db/schema'
import { publishSensorValue } from '@/lib/mqtt'

export async function getSensorMappings() {
  return db.select().from(sensorMappings).all()
}

export async function getHaSensorMappings() {
  return db.select().from(sensorMappings).where(eq(sensorMappings.source, 'ha')).all()
}

export async function getMqttSensorMappings() {
  return db.select().from(sensorMappings).where(eq(sensorMappings.source, 'mqtt')).all()
}

export async function listSensorMappings() {
  return db.select().from(sensorMappings).all()
}

export async function addSensorMapping(plantId: number, topic: string, metric: string, source: string = 'mqtt') {
  db.insert(sensorMappings).values({ plantId, topic, metric, source }).run()
}

export async function deleteSensorMapping(id: number) {
  db.delete(sensorMappings).where(eq(sensorMappings.id, id)).run()
}

export async function recordReading(plantId: number, metric: string, value: number) {
  db.insert(sensorReadings)
    .values({ plantId, metric, value, unit: metric === 'moisture' ? '%' : metric === 'temperature' ? '°C' : 'lx' })
    .run()
  const cutoff = Math.floor(Date.now() / 1000) - 30 * 86400
  db.delete(sensorReadings).where(and(eq(sensorReadings.plantId, plantId), eq(sensorReadings.metric, metric), lt(sensorReadings.measuredAt, cutoff))).run()
  publishSensorValue(plantId, metric, value)
}
