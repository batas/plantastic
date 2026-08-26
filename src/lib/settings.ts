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
  ha?: {
    url?: string
    token?: string
    /** HA to-do list entity (todo.*) synced two-way with plant care tasks */
    todoEntity?: string
    /** persistent notifications for overdue care */
    notifyEnabled?: boolean
    notifyDaysOverdue?: number
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
  /** AI care plan auto-regeneration cycle in days (0 = disabled); per-plant carePlanDays overrides this */
  autoPlanDays?: number
}

function readOptions(): Record<string, unknown> {
  const candidates: string[] = []
  if (process.env.OPTIONS_FILE) candidates.push(process.env.OPTIONS_FILE)
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

export function getConfig(): AppConfig {
  const opts = readOptions()
  return {
    mqtt: {
      host: (opts.mqtt_host as string) ?? process.env.MQTT_HOST,
      port: Number(opts.mqtt_port ?? process.env.MQTT_PORT ?? 1883),
      user: (opts.mqtt_user as string) ?? process.env.MQTT_USER,
      password: (opts.mqtt_password as string) ?? process.env.MQTT_PASSWORD,
    },
    ha: {
      url: (opts.ha_url as string) ?? process.env.HA_URL,
      token: (opts.ha_token as string) ?? process.env.HA_TOKEN,
      todoEntity: (opts.ha_todo_entity as string) ?? undefined,
      notifyEnabled: opts.ha_notify_enabled !== false,
      notifyDaysOverdue: Number(opts.ha_notify_days_overdue ?? 1),
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
    autoPlanDays: Number(opts.auto_plan_days ?? 7),
  }
}

export function maskSecret(value: string | undefined): string {
  if (!value) return '(brak)'
  if (value.length <= 6) return '***'
  return value.slice(0, 3) + '***' + value.slice(-3)
}

export function getPhotosDir() {
  const dir = getDataDir()
  const photosDir = `${dir}/photos`
  return photosDir
}
