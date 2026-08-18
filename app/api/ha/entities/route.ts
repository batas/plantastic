import { NextResponse } from 'next/server'
import { getStates } from '@/lib/ha'

const ALLOWED_DEVICE_CLASSES = new Set(['humidity', 'temperature'])

export async function GET() {
  const entities = await getStates('sensor')
  const filtered = entities.filter(
    (e) =>
      e.entity_id.startsWith('sensor.') &&
      (e.attributes.device_class == null || ALLOWED_DEVICE_CLASSES.has(String(e.attributes.device_class))),
  )
  return NextResponse.json(
    filtered.map((e) => ({
      entity_id: e.entity_id,
      state: e.state,
      unit: e.attributes.unit_of_measurement ?? null,
      friendly_name: e.attributes.friendly_name ?? null,
      device_class: e.attributes.device_class ?? null,
    })),
  )
}
