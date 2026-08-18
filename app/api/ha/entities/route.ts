import { NextResponse } from 'next/server'
import { getStates } from '@/lib/ha'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const domain = url.searchParams.get('domain') ?? undefined
  const entities = await getStates(domain)
  return NextResponse.json(
    entities.map((e) => ({
      entity_id: e.entity_id,
      state: e.state,
      unit: e.attributes.unit_of_measurement ?? null,
      friendly_name: e.attributes.friendly_name ?? null,
      device_class: e.attributes.device_class ?? null,
    })),
  )
}
