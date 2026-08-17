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
  sunlight?: string[]
  watering?: string[]
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
