import { NextResponse } from 'next/server'
import { addDeviceMapping, deleteDeviceMapping, getAllDeviceMappings } from '@/lib/services/sensors'

export async function GET() {
  return NextResponse.json(getAllDeviceMappings())
}

export async function POST(request: Request) {
  const body = await request.json()
  const plantId = Number(body.plantId)
  const haDeviceId = String(body.haDeviceId ?? '').trim()
  if (!plantId || !haDeviceId) return NextResponse.json({ error: 'plantId i haDeviceId są wymagane' }, { status: 400 })
  const m = addDeviceMapping(plantId, haDeviceId, body.deviceName ?? null)
  return NextResponse.json(m, { status: 201 })
}

export async function DELETE(request: Request) {
  const url = new URL(request.url)
  const id = url.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Brak id' }, { status: 400 })
  deleteDeviceMapping(Number(id))
  return new NextResponse(null, { status: 204 })
}
