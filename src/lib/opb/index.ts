import { getConfig, maskSecret } from '@/lib/settings'

const API = 'https://open.plantbook.io/api/v1'

let tokenCache: { token: string; expires: number } | null = null

async function getToken(): Promise<string | null> {
  const cfg = getConfig()
  if (!cfg.opb?.clientId || !cfg.opb?.secret) return null
  if (tokenCache && tokenCache.expires > Date.now() / 1000 + 60) return tokenCache.token
  console.log(`[opb] authenticating: clientId=${cfg.opb.clientId} secret=${maskSecret(cfg.opb.secret)}`)
  const res = await fetch(`${API}/token/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: cfg.opb.clientId,
      client_secret: cfg.opb.secret,
    }).toString(),
  })
  if (!res.ok) throw new Error(`OPB auth failed: ${res.status}`)
  const data = (await res.json()) as { access_token: string; expires_in: number }
  tokenCache = { token: data.access_token, expires: Date.now() / 1000 + data.expires_in }
  return data.access_token
}

export interface OpbPlant {
  pid: string
  display_pid: string
  alias?: string | null
  category?: string | null
  scientific_name?: string
  scientific_name_authorship?: string
  common_name?: string
  family?: string
  genus?: string
  image_url?: string
  flowers?: string
  fruits?: string
  leaves?: string
  maintenance?: string
  growth_rate?: string
  salt_tolerant?: string
  sunlight?: string[] | string
  watering?: string[] | string
  drought_tolerant?: boolean
  medicinal?: boolean
  poisonous_to_humans?: number
  poisonous_to_pets?: number
}

export async function searchOpb(query: string): Promise<OpbPlant[]> {
  const token = await getToken()
  if (!token) throw new Error('OpenPlantBook: brak client_id/secret')
  const res = await fetch(`${API}/plant/search?alias=${encodeURIComponent(query)}&limit=8`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`OPB search failed: ${res.status}`)
  const data = (await res.json()) as { results: { pid: string; display_pid: string; alias?: string; category?: string }[] }
  const results = data.results ?? []
  const enriched = await Promise.all(
    results.slice(0, 5).map(async (r) => {
      try {
        const detail = await fetch(`${API}/plant/detail/${encodeURIComponent(r.pid)}/?include=care`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (detail.ok) {
          const full = await detail.json() as OpbPlant
          return { ...r, ...full, pid: r.pid, display_pid: r.display_pid }
        }
      } catch {}
      return { ...r, scientific_name: r.display_pid, common_name: r.alias }
    })
  )
  return enriched
}

export async function getOpbInfo(scientificName?: string | null): Promise<OpbPlant | null> {
  if (!scientificName) return null
  try {
    const results = await searchOpb(scientificName)
    return results[0] ?? null
  } catch (err) {
    console.warn('[opb]', err)
    return null
  }
}

export async function translateOpbGuide(guide: OpbPlant): Promise<OpbPlant> {
  const cfg = getConfig()
  const provider = cfg.llm?.provider ?? 'ollama'
  const apiKey = cfg.llm?.apiKey
  if (!apiKey && provider !== 'ollama') return guide

  const fields: Record<string, string> = {}
  if (guide.maintenance) fields.maintenance = guide.maintenance
  if (guide.growth_rate) fields.growth_rate = guide.growth_rate
  if (guide.sunlight) fields.sunlight = Array.isArray(guide.sunlight) ? guide.sunlight.join(', ') : guide.sunlight
  if (guide.watering) fields.watering = Array.isArray(guide.watering) ? guide.watering.join(', ') : guide.watering
  if (guide.common_name) fields.common_name = guide.common_name

  if (Object.keys(fields).length === 0) return guide

  const prompt = `Przetłumacz wartości pól ogrodniczych z angielskiego na polski. Odpowiedz TYLKO poprawnym JSON (bez markdownu), gdzie kluczami są te same pola co w input, a wartościami są przetłumaczone na polski. Nie zmieniaj struktury, nie dodawaj nic nowego. Jeśli wartość jest już po polsku, zostaw ją bez zmian.

Input: ${JSON.stringify(fields)}`

  try {
    let text = ''
    if (provider === 'anthropic') {
      const { Anthropic } = await import('@anthropic-ai/sdk')
      const client = new Anthropic({ apiKey })
      const model = cfg.llm?.model ?? 'claude-3-5-sonnet-latest'
      const res = await client.messages.create({ model, max_tokens: 300, messages: [{ role: 'user', content: prompt }] })
      text = res.content.filter((b) => b.type === 'text').map((b) => b.text).join('')
    } else if (provider === 'litellm') {
      const base = (cfg.llm?.baseUrl ?? 'http://localhost:4000').replace(/\/+$/, '')
      const model = cfg.llm?.model ?? 'gpt-4o-mini'
      const key = apiKey ?? ''
      const res = await fetch(`${base}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}`, 'x-litellm-api-key': key },
        body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], max_tokens: 300 }),
      })
      if (res.ok) {
        const data = await res.json() as { choices?: { message?: { content?: string } }[] }
        text = data.choices?.[0]?.message?.content ?? ''
      }
    } else {
      const OpenAI = (await import('openai')).default
      const baseURL = provider === 'ollama' ? cfg.llm?.baseUrl ?? 'http://localhost:11434/v1' : undefined
      const client = new OpenAI({ apiKey: provider === 'ollama' ? 'ollama' : apiKey, baseURL })
      const model = cfg.llm?.model ?? 'gpt-4o-mini'
      const res = await client.chat.completions.create({ model, messages: [{ role: 'user', content: prompt }], max_tokens: 300 })
      text = res.choices[0]?.message?.content ?? ''
    }

    const cleaned = text.replace(/```json|```/g, '').trim()
    const start = cleaned.indexOf('{')
    const end = cleaned.lastIndexOf('}')
    if (start === -1 || end === -1) return guide
    const translated = JSON.parse(cleaned.slice(start, end + 1)) as Record<string, string>
    console.log('[opb] translated guide:', translated)
    return {
      ...guide,
      common_name: translated.common_name ?? guide.common_name,
      maintenance: translated.maintenance ?? guide.maintenance,
      growth_rate: translated.growth_rate ?? guide.growth_rate,
      sunlight: translated.sunlight ?? guide.sunlight,
      watering: translated.watering ?? guide.watering,
    }
  } catch (err) {
    console.warn('[opb] translate failed, using original:', err)
    return guide
  }
}
