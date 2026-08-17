import { NextResponse } from 'next/server'
import OpenAI from 'openai'
import { Anthropic } from '@anthropic-ai/sdk'
import { getConfig, writeOptions, maskSecret } from '@/lib/settings'
import { connectMqtt, isConnected } from '@/lib/mqtt'

export async function POST(request: Request) {
  const body = await request.json()
  const type = body.type as string
  try {
    if (type === 'mqtt') {
      const mqttCfg = body.mqtt as { host?: string; port?: number; user?: string; password?: string } | undefined
      console.log(`[test] mqtt: host=${mqttCfg?.host} port=${mqttCfg?.port} user=${mqttCfg?.user} password=${maskSecret(mqttCfg?.password)}`)
      if (mqttCfg) {
        const patch: Record<string, unknown> = {}
        if (mqttCfg.host !== undefined) patch.mqtt_host = mqttCfg.host
        if (mqttCfg.port !== undefined) patch.mqtt_port = mqttCfg.port
        if (mqttCfg.user !== undefined) patch.mqtt_user = mqttCfg.user
        if (mqttCfg.password !== undefined) patch.mqtt_password = mqttCfg.password
        writeOptions(patch)
      }
      await connectMqtt()
      const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
      for (let i = 0; i < 10; i++) {
        if (isConnected()) return NextResponse.json({ ok: true, message: 'Połączono z MQTT' })
        await wait(500)
      }
      return NextResponse.json({ ok: false, message: 'Nie udało się połączyć z MQTT' }, { status: 500 })
    }

    if (type === 'llm') {
      const cfg = getConfig()
      const provider = cfg.llm?.provider ?? 'ollama'
      console.log(`[test] llm: provider=${provider} model=${cfg.llm?.model} apiKey=${maskSecret(cfg.llm?.apiKey)} baseURL=${cfg.llm?.baseUrl ?? '(default)'}`)

      if (provider === 'anthropic') {
        if (!cfg.llm?.apiKey) return NextResponse.json({ ok: false, message: 'Brak klucza API' }, { status: 400 })
        const client = new Anthropic({ apiKey: cfg.llm.apiKey })
        const model = cfg.llm.model ?? 'claude-3-5-sonnet-latest'
        const res = await client.messages.create({
          model,
          max_tokens: 50,
          messages: [{ role: 'user', content: 'Odpowiedz tylko: OK' }],
        })
        const text = res.content.filter((b) => b.type === 'text').map((b) => b.text).join('')
        return NextResponse.json({ ok: true, message: `Anthropic OK — ${model}`, details: text.slice(0, 100) })
      }

      if (provider === 'litellm') {
        if (!cfg.llm?.apiKey) return NextResponse.json({ ok: false, message: 'Brak klucza API' }, { status: 400 })
        const base = (cfg.llm?.baseUrl ?? 'http://localhost:4000').replace(/\/+$/, '')
        const model = cfg.llm?.model ?? 'gpt-4o-mini'
        console.log(`[test] litellm fetch: ${base}/chat/completions model=${model}`)
        const res = await fetch(`${base}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${cfg.llm.apiKey}`,
            'x-litellm-api-key': cfg.llm.apiKey,
          },
          body: JSON.stringify({
            model,
            messages: [{ role: 'user', content: 'Odpowiedz tylko: OK' }],
            max_tokens: 50,
          }),
        })
        const data = await res.json() as Record<string, unknown>
        if (!res.ok) {
          const detail = typeof data.error === 'object' && data.error !== null ? (data.error as Record<string, unknown>).message : JSON.stringify(data)
          return NextResponse.json({ ok: false, message: `LiteLLM ${res.status}: ${detail}` }, { status: 502 })
        }
        const text = Array.isArray(data.choices) ? ((data.choices[0] as Record<string, unknown>)?.message as Record<string, unknown>)?.content ?? '' : ''
        return NextResponse.json({ ok: true, message: `LiteLLM OK — ${model}`, details: String(text).slice(0, 100) })
      }

      const baseURL = provider === 'ollama'
        ? cfg.llm?.baseUrl ?? 'http://localhost:11434/v1'
        : undefined
      const apiKey = provider === 'ollama' ? 'ollama' : (cfg.llm?.apiKey ?? '')
      const client = new OpenAI({ baseURL, apiKey })
      const model = provider === 'ollama' ? cfg.llm?.model ?? 'llava' : cfg.llm?.model ?? 'gpt-4o-mini'
      const res = await client.chat.completions.create({
        model,
        messages: [{ role: 'user', content: 'Odpowiedz tylko: OK' }],
        max_tokens: 50,
      })
      const text = res.choices[0]?.message?.content ?? ''
      return NextResponse.json({ ok: true, message: `${provider} OK — ${model}`, details: text.slice(0, 100) })
    }

    if (type === 'opb') {
      const cfg = getConfig()
      console.log(`[test] opb: clientId=${cfg.opb?.clientId} secret=${maskSecret(cfg.opb?.secret)}`)
      if (!cfg.opb?.clientId || !cfg.opb?.secret) {
        return NextResponse.json({ ok: false, message: 'Brak client_id lub secret' }, { status: 400 })
      }
      const res = await fetch('https://open.plantbook.io/api/v1/token/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: cfg.opb.clientId,
          client_secret: cfg.opb.secret,
        }).toString(),
      })
      if (!res.ok) {
        const err = await res.text()
        return NextResponse.json({ ok: false, message: `OPB auth failed: ${res.status}`, details: err.slice(0, 200) }, { status: 500 })
      }
      return NextResponse.json({ ok: true, message: 'OpenPlantBook połączony' })
    }

    return NextResponse.json({ ok: false, message: `Nieznany typ testu: ${type}` }, { status: 400 })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[test] ${type} failed:`, msg)
    return NextResponse.json({ ok: false, message: msg }, { status: 500 })
  }
}
