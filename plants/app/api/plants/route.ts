import { NextResponse } from 'next/server'
import { createPlant, listPlants } from '@/lib/services/plants'

export async function GET() {
  return NextResponse.json(await listPlants())
}

export async function POST(request: Request) {
  const body = await request.json()
  const name = String(body.name ?? '').trim()
  if (!name) return NextResponse.json({ error: 'Nazwa jest wymagana' }, { status: 400 })
  const plant = await createPlant({
    name,
    species: body.species ? String(body.species) : undefined,
    scientificName: body.scientificName ? String(body.scientificName) : undefined,
    opbId: body.opbId ? Number(body.opbId) : undefined,
    location: body.location ? String(body.location) : undefined,
    notes: body.notes ? String(body.notes) : undefined,
    waterIntervalDays: body.waterIntervalDays != null ? Number(body.waterIntervalDays) : undefined,
    fertilizeIntervalDays: body.fertilizeIntervalDays != null ? Number(body.fertilizeIntervalDays) : undefined,
    mistIntervalDays: body.mistIntervalDays != null ? Number(body.mistIntervalDays) : undefined,
    cleanIntervalDays: body.cleanIntervalDays != null ? Number(body.cleanIntervalDays) : undefined,
    rotateIntervalDays: body.rotateIntervalDays != null ? Number(body.rotateIntervalDays) : undefined,
  })
  return NextResponse.json(plant, { status: 201 })
}
