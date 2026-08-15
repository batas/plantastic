import { NextResponse } from 'next/server'
import { logCare, normalizeCareKind } from '@/lib/services/care'
import { getPlant } from '@/lib/services/plants'
import { publishWatered, publishCareStatus } from '@/lib/mqtt'

export async function POST(request: Request, ctx: RouteContext<'/api/plants/[id]/care'>) {
  const { id } = await ctx.params
  const plantId = Number(id)
  if (!(await getPlant(plantId))) return NextResponse.json({ error: 'Nie znaleziono rośliny' }, { status: 404 })
  const body = await request.json()
  const kind = normalizeCareKind(String(body.kind ?? 'water'))
  if (!kind) return NextResponse.json({ error: 'Nieznany typ pielęgnacji' }, { status: 400 })
  await logCare(
    plantId,
    kind,
    body.amount != null ? Number(body.amount) : undefined,
    body.unit ? String(body.unit) : undefined,
    body.notes ? String(body.notes) : undefined,
  )
  if (kind === 'water') await publishWatered(plantId)
  await publishCareStatus(plantId)
  return NextResponse.json({ ok: true })
}
