import { readFileSync, existsSync, writeFileSync } from 'node:fs'
import { getDataDir } from '@/lib/db'

export type LlmProvider = 'openai' | 'anthropic' | 'ollama' | 'litellm'

export interface AppConfig {
  mqtt?: {
    host?: string
    port?: number
    user?: string
    password?: string
  }
  llm?: {
    provider: LlmProvider
    model?: string
    apiKey?: string
    baseUrl?: string
  }
  opb?: {
    clientId?: string
    secret?: string
  }
  reminderEnabled?: boolean
}

function readOptions(): Record<string, unknown> {
  const candidates: string[] = []
  if (process.env.OPTIONS_FILE) candidates.push(process.env.OPTIONS_FILE)
  candidates.push('/data/options.json')
  candidates.push(`${getDataDir()}/options.json`)
  for (const optionsPath of candidates) {
    if (existsSync(optionsPath)) {
      try {
        return JSON.parse(readFileSync(optionsPath, 'utf8'))
      } catch (err) {
        console.error('[settings] failed to parse', optionsPath, err)
      }
    }
  }
  return {}
}

export function writeOptions(patch: Record<string, unknown>) {
  const opts = { ...readOptions(), ...patch }
  const target = process.env.OPTIONS_FILE ?? `${getDataDir()}/options.json`
  writeFileSync(target, JSON.stringify(opts, null, 2))
  return opts
}

interface HassMqttConfig {
  mqtt_host?: string
  mqtt_port?: number
  mqtt_user?: string
  mqtt_password?: string
}

export async function fetchHassMqttConfig(): Promise<HassMqttConfig | null> {
  const token = process.env.SUPERVISOR_TOKEN
  if (!token) return null
  try {
    const res = await fetch('http://supervisor/core/api/config', {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) {
      console.warn('[settings] Supervisor API returned', res.status)
      return null
    }
    const data = await res.json() as Record<string, unknown>
    const core = data.core_config as Record<string, unknown> | undefined
    const mqtt = (core?.mqtt ?? core?.MQTT ?? data.mqtt) as Record<string, unknown> | undefined
    if (!mqtt) return null
    const host = (mqtt.host as string) ?? (mqtt.broker as string)
    const port = Number(mqtt.port ?? 1883)
    const user = (mqtt.user as string) ?? (mqtt.username as string)
    const password = mqtt.password as string | undefined
    if (!host) return null
    return { mqtt_host: host, mqtt_port: port, mqtt_user: user, mqtt_password: password }
  } catch (err) {
    console.warn('[settings] Supervisor API fetch failed:', err)
    return null
  }
}

export function getConfig(): AppConfig {
  const opts = readOptions()
  return {
    mqtt: {
      host: (opts.mqtt_host as string) ?? process.env.MQTT_HOST,
      port: Number(opts.mqtt_port ?? process.env.MQTT_PORT ?? 1883),
      user: (opts.mqtt_user as string) ?? process.env.MQTT_USER,
      password: (opts.mqtt_password as string) ?? process.env.MQTT_PASSWORD,
    },
    llm: {
      provider: ((opts.llm_provider as string) ?? process.env.LLM_PROVIDER ?? 'ollama') as LlmProvider,
      model: (opts.llm_model as string) ?? process.env.LLM_MODEL,
      apiKey: (opts.llm_api_key as string) ?? process.env.LLM_API_KEY,
      baseUrl: (opts.llm_base_url as string) ?? process.env.LLM_BASE_URL,
    },
    opb: {
      clientId: (opts.opb_client_id as string) ?? process.env.OPB_CLIENT_ID,
      secret: (opts.opb_secret as string) ?? process.env.OPB_SECRET,
    },
    reminderEnabled: opts.reminder_enabled !== false,
  }
}

export function getPhotosDir() {
  const dir = getDataDir()
  const photosDir = `${dir}/photos`
  return photosDir
}
