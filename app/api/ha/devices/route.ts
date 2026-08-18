import { NextResponse } from 'next/server'
import { getDevicesWithSensors } from '@/lib/ha'

export async function GET() {
  const devices = await getDevicesWithSensors()
  return NextResponse.json(devices)
}
