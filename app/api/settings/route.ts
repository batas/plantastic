import { NextResponse } from 'next/server'
import { getConfig, writeOptions } from '@/lib/settings'
import { connectMqtt, isConnected } from '@/lib/mqtt'

export async function GET() {
  const cfg = getConfig()
  return NextResponse.json({
    mqtt: {
      host: cfg.mqtt?.host ?? '',
      port: cfg.mqtt?.port ?? 1883,
      user: cfg.mqtt?.user ?? '',
      hasPassword: Boolean(cfg.mqtt?.password),
    },
    ha: {
      url: cfg.ha?.url ?? '',
      hasToken: Boolean(cfg.ha?.token),
      todoEntity: cfg.ha?.todoEntity ?? '',
      notifyEnabled: cfg.ha?.notifyEnabled !== false,
      notifyDaysOverdue: cfg.ha?.notifyDaysOverdue ?? 1,
    },
    llm: {
      provider: cfg.llm?.provider ?? 'ollama',
      model: cfg.llm?.model ?? '',
      hasApiKey: Boolean(cfg.llm?.apiKey),
      baseUrl: cfg.llm?.baseUrl ?? '',
    },
    opb: {
      hasClientId: Boolean(cfg.opb?.clientId),
      hasSecret: Boolean(cfg.opb?.secret),
    },
    connected: isConnected(),
  })
}

export async function POST(request: Request) {
  const body = await request.json()
  const patch: Record<string, unknown> = {}
  if (body.mqtt) {
    if (body.mqtt.host !== undefined) patch.mqtt_host = String(body.mqtt.host)
    if (body.mqtt.port !== undefined) patch.mqtt_port = Number(body.mqtt.port)
    if (body.mqtt.user !== undefined) patch.mqtt_user = String(body.mqtt.user)
    if (body.mqtt.password !== undefined) patch.mqtt_password = String(body.mqtt.password)
  }
  if (body.ha) {
    if (body.ha.url !== undefined) patch.ha_url = String(body.ha.url)
    if (body.ha.token !== undefined) patch.ha_token = String(body.ha.token)
    if (body.ha.todoEntity !== undefined) patch.ha_todo_entity = String(body.ha.todoEntity)
    if (body.ha.notifyEnabled !== undefined) patch.ha_notify_enabled = Boolean(body.ha.notifyEnabled)
    if (body.ha.notifyDaysOverdue !== undefined) patch.ha_notify_days_overdue = Math.max(1, Number(body.ha.notifyDaysOverdue) || 1)
  }
  if (body.llm) {
    if (body.llm.provider !== undefined) patch.llm_provider = String(body.llm.provider)
    if (body.llm.model !== undefined) patch.llm_model = String(body.llm.model)
    if (body.llm.apiKey !== undefined) patch.llm_api_key = String(body.llm.apiKey)
    if (body.llm.baseUrl !== undefined) patch.llm_base_url = String(body.llm.baseUrl)
  }
  if (body.opb) {
    if (body.opb.clientId !== undefined) patch.opb_client_id = String(body.opb.clientId)
    if (body.opb.secret !== undefined) patch.opb_secret = String(body.opb.secret)
  }
  writeOptions(patch)
  if (body.mqtt) {
    await connectMqtt().catch((err) => console.error('[settings] mqtt reconnect failed', err))
  }
  return NextResponse.json({ ok: true })
}
