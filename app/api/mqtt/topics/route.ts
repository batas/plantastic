import { NextResponse } from 'next/server'
import { listMqttTopics } from '@/lib/mqtt'

export async function GET() {
  try {
    const topics = await listMqttTopics()
    return NextResponse.json(topics)
  } catch (err) {
    console.error('[mqtt/topics] error:', err)
    return NextResponse.json({ error: 'Nie udało się pobrać topiców' }, { status: 502 })
  }
}
