import { NextResponse } from 'next/server'
import { listMqttTopics, isConnected } from '@/lib/mqtt'

export async function GET() {
  if (!isConnected()) {
    return NextResponse.json({ error: 'MQTT nie jest połączone' }, { status: 503 })
  }

  try {
    const topics = await listMqttTopics()
    return NextResponse.json(topics)
  } catch (err) {
    console.error('[mqtt/topics] error:', err)
    return NextResponse.json({ error: 'Nie udało się pobrać topiców' }, { status: 502 })
  }
}
