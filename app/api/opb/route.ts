import { NextResponse } from 'next/server'
import { searchOpb } from '@/lib/opb'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const q = url.searchParams.get('q')
  if (!q || q.trim().length < 2) return NextResponse.json([])
  try {
    const results = await searchOpb(q.trim())
    return NextResponse.json(results)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'OpenPlantBook error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
