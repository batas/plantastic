import { NextResponse } from 'next/server'
import { deletePlant, getPlantDetail, updatePlant } from '@/lib/services/plants'

export async function GET(_req: Request, ctx: RouteContext<'/api/plants/[id]'>) {
  const { id } = await ctx.params
  const detail = await getPlantDetail(Number(id))
  if (!detail) return NextResponse.json({ error: 'Nie znaleziono' }, { status: 404 })
  return NextResponse.json(detail)
}

export async function PUT(request: Request, ctx: RouteContext<'/api/plants/[id]'>) {
  const { id } = await ctx.params
  const body = await request.json()
  const plant = await updatePlant(Number(id), {
    name: body.name !== undefined ? String(body.name) : undefined,
    species: body.species !== undefined ? (body.species ? String(body.species) : null) : undefined,
    scientificName: body.scientificName !== undefined ? (body.scientificName ? String(body.scientificName) : null) : undefined,
    opbId: body.opbId !== undefined ? (body.opbId ? String(body.opbId) : null) : undefined,
    location: body.location !== undefined ? (body.location ? String(body.location) : null) : undefined,
    notes: body.notes !== undefined ? (body.notes ? String(body.notes) : null) : undefined,
    waterIntervalDays: body.waterIntervalDays !== undefined ? (body.waterIntervalDays != null ? Number(body.waterIntervalDays) : null) : undefined,
    fertilizeIntervalDays: body.fertilizeIntervalDays !== undefined ? (body.fertilizeIntervalDays != null ? Number(body.fertilizeIntervalDays) : null) : undefined,
    mistIntervalDays: body.mistIntervalDays !== undefined ? (body.mistIntervalDays != null ? Number(body.mistIntervalDays) : null) : undefined,
    cleanIntervalDays: body.cleanIntervalDays !== undefined ? (body.cleanIntervalDays != null ? Number(body.cleanIntervalDays) : null) : undefined,
    rotateIntervalDays: body.rotateIntervalDays !== undefined ? (body.rotateIntervalDays != null ? Number(body.rotateIntervalDays) : null) : undefined,
    potDiameterCm: body.potDiameterCm !== undefined ? (body.potDiameterCm != null ? Number(body.potDiameterCm) : null) : undefined,
    plantHeightCm: body.plantHeightCm !== undefined ? (body.plantHeightCm != null ? Number(body.plantHeightCm) : null) : undefined,
    potMaterial: body.potMaterial !== undefined ? (body.potMaterial ? String(body.potMaterial) : null) : undefined,
    substrateType: body.substrateType !== undefined ? (body.substrateType ? String(body.substrateType) : null) : undefined,
    lastRepottedAt: body.lastRepottedAt !== undefined ? (body.lastRepottedAt != null ? Number(body.lastRepottedAt) : null) : undefined,
    waterType: body.waterType !== undefined ? (body.waterType ? String(body.waterType) : null) : undefined,
  } as Parameters<typeof updatePlant>[1])
  if (!plant) return NextResponse.json({ error: 'Nie znaleziono' }, { status: 404 })
  return NextResponse.json(plant)
}

export async function DELETE(_req: Request, ctx: RouteContext<'/api/plants/[id]'>) {
  const { id } = await ctx.params
  await deletePlant(Number(id))
  return new NextResponse(null, { status: 204 })
}
