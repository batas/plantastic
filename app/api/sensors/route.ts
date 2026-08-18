import { NextResponse } from 'next/server'
import { addSensorMapping, deleteSensorMapping, listSensorMappings } from '@/lib/services/sensors'
import { getPlant } from '@/lib/services/plants'
import { refreshSubscriptions } from '@/lib/mqtt'

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
  const topic = String(body.topic ?? '').trim()
  const metric = String(body.metric ?? 'moisture').trim()
  const source = String(body.source ?? 'mqtt').trim()
  if (!plantId || !topic) return NextResponse.json({ error: 'plantId i topic są wymagane' }, { status: 400 })
  if (!(await getPlant(plantId))) return NextResponse.json({ error: 'Nie znaleziono rośliny' }, { status: 404 })
  addSensorMapping(plantId, topic, metric, source)
  if (source === 'mqtt') await refreshSubscriptions()
  return NextResponse.json({ ok: true }, { status: 201 })
}

export async function DELETE(request: Request) {
  const url = new URL(request.url)
  const id = url.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Brak id' }, { status: 400 })
  deleteSensorMapping(Number(id))
  await refreshSubscriptions()
  return new NextResponse(null, { status: 204 })
}
