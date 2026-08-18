import { NextResponse } from 'next/server'
import { getStates, getEntityRegistry, getDevices, getAreas } from '@/lib/ha'

const ALLOWED_DEVICE_CLASSES = new Set(['humidity', 'temperature', 'moisture'])

export async function GET() {
  try {
    const [entities, entityRegistry, devices, areas] = await Promise.all([
      getStates('sensor'),
      getEntityRegistry(),
      getDevices(),
      getAreas(),
    ])
    const areaMap = new Map(areas.map((a) => [a.area_id, a.name]))
    const deviceMap = new Map(devices.map((d) => [d.id, d]))
    const entityAreaMap = new Map(entityRegistry.map((e) => [e.entity_id, e.area_id ?? (e.device_id ? deviceMap.get(e.device_id)?.area_id : null)]))

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
        area: areaMap.get(entityAreaMap.get(e.entity_id) ?? '') ?? null,
      })),
    )
  } catch (err) {
    console.error('[ha/entities] error:', err)
    return NextResponse.json({ error: 'Błąd pobierania encji z HA', details: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
