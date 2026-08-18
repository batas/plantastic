import { NextResponse } from 'next/server'
import { addSensorMapping, deleteSensorMapping, listSensorMappings } from '@/lib/services/sensors'
import { getPlant } from '@/lib/services/plants'

export async function GET() {
  const mappings = await listSensorMappings()
  const result = []
  for (const m of mappings) {
    const plant = await getPlant(m.plantId)
    result.push({ ...m, plantName: plant?.name ?? null })
  }
  return NextResponse.json(result)
}

export async function POST(request: Request) {
  const body = await request.json()
  const plantId = Number(body.plantId)
  if (!plantId) return NextResponse.json({ error: 'plantId jest wymagany' }, { status: 400 })
  if (!(await getPlant(plantId))) return NextResponse.json({ error: 'Nie znaleziono rośliny' }, { status: 404 })

  if (Array.isArray(body.mappings)) {
    for (const m of body.mappings) {
      const topic = String(m.topic ?? '').trim()
      const metric = String(m.metric ?? 'moisture').trim()
      if (topic) addSensorMapping(plantId, topic, metric, 'ha')
    }
    return NextResponse.json({ ok: true }, { status: 201 })
  }

  const topic = String(body.topic ?? '').trim()
  const metric = String(body.metric ?? 'moisture').trim()
  if (!topic) return NextResponse.json({ error: 'topic jest wymagany' }, { status: 400 })
  addSensorMapping(plantId, topic, metric, 'ha')
  return NextResponse.json({ ok: true }, { status: 201 })
}

export async function DELETE(request: Request) {
  const url = new URL(request.url)
  const id = url.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Brak id' }, { status: 400 })
  deleteSensorMapping(Number(id))
  return new NextResponse(null, { status: 204 })
}
