import { NextResponse } from 'next/server'
import { identifyPlant } from '@/lib/llm/identify'
import { searchOpb } from '@/lib/opb'

export async function POST(request: Request) {
  const form = await request.formData()
  const file = form.get('file')
  if (!(file instanceof File)) return NextResponse.json({ error: 'Brak pliku' }, { status: 400 })
  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg'
  const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg'
  const buf = Buffer.from(await file.arrayBuffer())
  try {
    const identification = await identifyPlant({ data: buf.toString('base64'), mime })
    let opb: Awaited<ReturnType<typeof searchOpb>> = []
    if (identification.scientificName) {
      try {
        opb = await searchOpb(identification.scientificName)
      } catch (err) {
        console.warn('[identify] opb', err)
      }
    }
    return NextResponse.json({ identification, opb })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Błąd identyfikacji'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
