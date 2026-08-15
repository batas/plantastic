import { NextResponse } from 'next/server'
import { healthCheck } from '@/lib/llm/identify'
import { addTimelineEntry } from '@/lib/services/care'
import { getPlant } from '@/lib/services/plants'

export async function POST(_request: Request, ctx: RouteContext<'/api/plants/[id]/health'>) {
  const { id } = await ctx.params
  const plantId = Number(id)
  if (!(await getPlant(plantId))) return NextResponse.json({ error: 'Nie znaleziono rośliny' }, { status: 404 })
  try {
    const verdict = await healthCheck(plantId)
    await addTimelineEntry(plantId, {
      kind: 'care_plan',
      title: 'Przegląd stanu',
      content: [verdict.summary, ...(verdict.issues.length ? ['Problemy: ' + verdict.issues.join('; ')] : []), ...verdict.advice.map((a) => `• ${a}`)].join('\n'),
      dataJson: JSON.stringify({ type: 'health', ...verdict }),
    })
    return NextResponse.json({ ok: true, verdict })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Błąd przeglądu stanu'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
