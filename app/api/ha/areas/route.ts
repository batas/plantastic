import { NextResponse } from 'next/server'
import { getAreas } from '@/lib/ha'

export async function GET() {
  try {
    const areas = await getAreas()
    return NextResponse.json(areas)
  } catch (err) {
    console.error('[ha/areas] error:', err)
    return NextResponse.json({ error: 'Błąd pobierania obszarów z HA', details: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
