import { NextResponse } from 'next/server'
import { isConnected } from '@/lib/mqtt'

export async function GET() {
  return NextResponse.json({ connected: isConnected() })
}
