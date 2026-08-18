import { NextResponse } from 'next/server'
import { getDevicesWithSensors } from '@/lib/ha'

export async function GET() {
  try {
    const devices = await getDevicesWithSensors()
    return NextResponse.json(devices)
  } catch (err) {
    console.error('[ha/devices] error:', err)
    return NextResponse.json({ error: 'Błąd pobierania urządzeń z HA', details: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
