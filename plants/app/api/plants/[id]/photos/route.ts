import { NextResponse } from 'next/server'
import { savePhoto } from '@/lib/services/photos'
import { getPlant } from '@/lib/services/plants'

export async function POST(request: Request, ctx: RouteContext<'/api/plants/[id]/photos'>) {
  const { id } = await ctx.params
  const plantId = Number(id)
  if (!(await getPlant(plantId))) return NextResponse.json({ error: 'Nie znaleziono rośliny' }, { status: 404 })
  const form = await request.formData()
  const file = form.get('file')
  if (!(file instanceof File)) return NextResponse.json({ error: 'Brak pliku' }, { status: 400 })
  const caption = form.get('caption') ? String(form.get('caption')) : undefined
  const addToTimeline = form.get('addToTimeline') !== 'false'
  try {
    const photoId = await savePhoto({ plantId, file, caption, addToTimeline })
    return NextResponse.json({ id: photoId }, { status: 201 })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Błąd dodawania zdjęcia'
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}
