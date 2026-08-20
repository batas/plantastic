import { NextResponse } from 'next/server'
import { addTimelineEntry, deleteTimelineEntry, updateTimelineEntryCreatedAt } from '@/lib/services/care'
import { getPlant } from '@/lib/services/plants'

export async function POST(request: Request, ctx: RouteContext<'/api/plants/[id]/timeline'>) {
  const { id } = await ctx.params
  const plantId = Number(id)
  if (!(await getPlant(plantId))) return NextResponse.json({ error: 'Nie znaleziono rośliny' }, { status: 404 })
  const body = await request.json()
  await addTimelineEntry(plantId, {
    kind: body.kind ? String(body.kind) : undefined,
    title: body.title ? String(body.title) : undefined,
    content: body.content ? String(body.content) : undefined,
    photoId: body.photoId != null ? Number(body.photoId) : undefined,
    dataJson: body.dataJson ? JSON.stringify(body.dataJson) : undefined,
  })
  return NextResponse.json({ ok: true }, { status: 201 })
}

export async function DELETE(request: Request, ctx: RouteContext<'/api/plants/[id]/timeline'>) {
  await ctx.params
  const url = new URL(request.url)
  const entryId = url.searchParams.get('id')
  if (!entryId) return NextResponse.json({ error: 'Brak id wpisu' }, { status: 400 })
  await deleteTimelineEntry(Number(entryId))
  return new NextResponse(null, { status: 204 })
}

export async function PATCH(request: Request, ctx: RouteContext<'/api/plants/[id]/timeline'>) {
  await ctx.params
  const body = await request.json()
  if (!body.id || !body.createdAt) return NextResponse.json({ error: 'Brak id lub createdAt' }, { status: 400 })
  await updateTimelineEntryCreatedAt(Number(body.id), Number(body.createdAt))
  return NextResponse.json({ ok: true })
}
