import { NextResponse } from 'next/server'

interface HassState {
  entity_id: string
  state: string
  attributes: {
    friendly_name?: string
    device_class?: string
    unit_of_measurement?: string
    [key: string]: unknown
  }
}

export async function GET() {
  const token = process.env.SUPERVISOR_TOKEN
  if (!token) {
    return NextResponse.json({ error: 'Brak SUPERVISOR_TOKEN - aplikacja nie działa jako addon HA' }, { status: 503 })
  }

  try {
    const res = await fetch('http://supervisor/core/api/states', {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) {
      return NextResponse.json({ error: `HA API zwróciło ${res.status}` }, { status: 502 })
    }
    const states = (await res.json()) as HassState[]

    const entities = states
      .filter((s) => s.entity_id.startsWith('sensor.') || s.entity_id.startsWith('binary_sensor.'))
      .map((s) => ({
        entity_id: s.entity_id,
        friendly_name: s.attributes.friendly_name ?? s.entity_id,
        device_class: s.attributes.device_class ?? null,
        unit: s.attributes.unit_of_measurement ?? null,
        state: s.state,
        domain: s.entity_id.split('.')[0],
      }))
      .sort((a, b) => a.friendly_name.localeCompare(b.friendly_name))

    return NextResponse.json(entities)
  } catch (err) {
    console.error('[ha/entities] fetch failed:', err)
    return NextResponse.json({ error: 'Nie udało się połączyć z HA' }, { status: 502 })
  }
}
