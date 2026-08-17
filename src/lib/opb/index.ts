import { getConfig } from '@/lib/settings'

const API = 'https://open.plantbook.io/api/v1'

let tokenCache: { token: string; expires: number } | null = null

async function getToken(): Promise<string | null> {
  const cfg = getConfig()
  if (!cfg.opb?.clientId || !cfg.opb?.secret) return null
  if (tokenCache && tokenCache.expires > Date.now() / 1000 + 60) return tokenCache.token
  const res = await fetch(`${API}/tenant/auth/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: cfg.opb.clientId, client_secret: cfg.opb.secret }).toString(),
  })
  if (!res.ok) throw new Error(`OPB auth failed: ${res.status}`)
  const data = (await res.json()) as { token: string; expires: number }
  tokenCache = { token: data.token, expires: data.expires }
  return data.token
}

export interface OpbPlant {
  pid: number
  display_pid: string
  scientific_name: string
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
  const res = await fetch(`${API}/plant/search?q=${encodeURIComponent(query)}&limit=8`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`OPB search failed: ${res.status}`)
  const data = (await res.json()) as { results: OpbPlant[] }
  return data.results ?? []
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
