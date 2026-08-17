import { NextResponse } from 'next/server'
import { generateCarePlan } from '@/lib/llm'
import { addTimelineEntry } from '@/lib/services/care'
import { getPlant } from '@/lib/services/plants'

export async function POST(request: Request, ctx: RouteContext<'/api/plants/[id]/care-plan'>) {
  const { id } = await ctx.params
  const plantId = Number(id)
  const plant = await getPlant(plantId)
  if (!plant) return NextResponse.json({ error: 'Nie znaleziono rośliny' }, { status: 404 })
  const body = await request.json().catch(() => ({}))
  try {
    const result = await generateCarePlan(plantId, body.provider)
    await addTimelineEntry(plantId, {
      kind: 'care_plan',
      title: `Plan pielęgnacji (${result.provider}: ${result.model})`,
      content: result.plan,
      dataJson: JSON.stringify({ provider: result.provider, model: result.model, format: 'markdown' }),
    })
    return NextResponse.json({ ok: true, plan: result.plan, provider: result.provider, model: result.model })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Błąd generowania planu'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
