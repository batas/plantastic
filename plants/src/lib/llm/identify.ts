import { readFileSync } from 'node:fs'
import path from 'node:path'
import OpenAI from 'openai'
import { Anthropic } from '@anthropic-ai/sdk'
import { getConfig, type LlmProvider } from '@/lib/settings'
import { getPhotosDir } from '@/lib/settings'
import { getPlantDetail } from '@/lib/services/plants'

export interface PlantIdentification {
  scientificName: string | null
  commonName: string | null
  family: string | null
  confidence: number | null
  description: string
}

export interface HealthVerdict {
  status: 'healthy' | 'needs_attention' | 'problems'
  confidence: number | null
  summary: string
  issues: string[]
  advice: string[]
}

type Provider = LlmProvider

function readImageBase64(photoPath: string): { data: string; mime: string } {
  const abs = path.join(getPhotosDir(), photoPath)
  const buf = readFileSync(abs)
  const ext = photoPath.split('.').pop()?.toLowerCase() ?? 'jpg'
  const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg'
  return { data: buf.toString('base64'), mime }
}

function selectedProvider(): Provider {
  const cfg = getConfig()
  return cfg.llm?.provider ?? 'ollama'
}

function apiKeyRequired(): string {
  return getConfig().llm?.apiKey ?? ''
}

const IDENTIFY_PROMPT =
  'Zidentyfikuj roślinę na zdjęciu. Odpowiedz TYLKO poprawnym JSON (bez markdownu) w formacie: ' +
  '{"scientificName": "łacińska nazwa gatunku lub null", "commonName": "polska lub potoczna nazwa", ' +
  '"family": "rodzina botaniczna lub null", "confidence": 0-1, "description": "krótki opis cech rozpoznawczych po polsku (1-2 zdania)"}. ' +
  'Jeśli nie potrafisz zidentyfikować, ustaw scientificName i commonName na null, confidence na niski.'

const HEALTH_PROMPT = (plantName: string, context: string) =>
  `Oceń stan rośliny "${plantName}" na podstawie zdjęć i danych.
${context}
Odpowiedz TYLKO poprawnym JSON (bez markdownu):
{"status": "healthy" | "needs_attention" | "problems", "confidence": 0-1, "summary": "jedno zdanie po polsku o ogólnym stanie", "issues": ["konkretne zauważone problemy, np. żółknięcie liści, przesuszenie; puste jeśli brak"], "advice": ["konkretne zalecenia po polsku"]}`

function parseJson<T>(text: string): T {
  const cleaned = text.replace(/```json|```/g, '').trim()
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start === -1 || end === -1) throw new Error('LLM nie zwrócił poprawnego JSON')
  return JSON.parse(cleaned.slice(start, end + 1)) as T
}

async function callVision(prompt: string, images: { data: string; mime: string }[]): Promise<string> {
  const cfg = getConfig()
  const provider = selectedProvider()
  if (provider === 'anthropic') {
    if (!cfg.llm?.apiKey) throw new Error('Brak klucza API dla Anthropic')
    const client = new Anthropic({ apiKey: cfg.llm.apiKey })
    const model = cfg.llm.model ?? 'claude-3-5-sonnet-latest'
    const content: Anthropic.ContentBlockParam[] = [{ type: 'text', text: prompt }]
    for (const img of images) {
      content.push({ type: 'image', source: { type: 'base64', media_type: img.mime as 'image/png' | 'image/jpeg' | 'image/webp', data: img.data } })
    }
    const res = await client.messages.create({ model, max_tokens: 800, messages: [{ role: 'user', content }] })
    return res.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
  }

  const client = new OpenAI({ apiKey: provider === 'ollama' ? 'ollama' : (cfg.llm?.apiKey ?? ''), baseURL: provider === 'ollama' ? cfg.llm?.baseUrl ?? 'http://localhost:11434/v1' : undefined })
  const model =
    provider === 'ollama' ? cfg.llm?.model ?? 'llava' : cfg.llm?.model ?? 'gpt-4o-mini'
  const parts: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [{ type: 'text', text: prompt }]
  for (const img of images) {
    parts.push({ type: 'image_url', image_url: { url: `data:${img.mime};base64,${img.data}` } })
  }
  const res = await client.chat.completions.create({
    model,
    messages: [{ role: 'user', content: parts }],
    max_tokens: 800,
    response_format: { type: 'json_object' },
  })
  return res.choices[0]?.message?.content ?? ''
}

export async function identifyPlant(image: { data: string; mime: string }): Promise<PlantIdentification> {
  void apiKeyRequired
  const text = await callVision(IDENTIFY_PROMPT, [image])
  const raw = parseJson<Partial<PlantIdentification>>(text)
  return {
    scientificName: raw.scientificName ?? null,
    commonName: raw.commonName ?? null,
    family: raw.family ?? null,
    confidence: typeof raw.confidence === 'number' ? raw.confidence : null,
    description: raw.description ?? '',
  }
}

export async function healthCheck(plantId: number): Promise<HealthVerdict> {
  const detail = await getPlantDetail(plantId)
  if (!detail || detail.photos.length === 0) {
    throw new Error('Dodaj najpierw zdjęcie rośliny, żeby zrobić przegląd stanu.')
  }
  const readings = Object.entries(detail.latestReadings)
    .map(([m, rs]) => `${m}: ${rs[0] ? `${rs[0].value}${rs[0].unit ?? ''}` : 'brak'}`)
    .join(', ')
  const lastWater = detail.careLogs.find((c) => c.kind === 'water')
  const context = [
    `Czujniki: ${readings || 'brak'}`,
    `Ostatnie podlewanie: ${lastWater ? new Date(lastWater.createdAt * 1000).toLocaleString('pl-PL') : 'brak'}`,
  ].join('\n')
  const images = detail.photos.slice(0, 4).map((p) => readImageBase64(p.path))
  const text = await callVision(HEALTH_PROMPT(detail.plant.name, context), images)
  const raw = parseJson<Partial<HealthVerdict>>(text)
  return {
    status: raw.status === 'needs_attention' || raw.status === 'problems' || raw.status === 'healthy' ? raw.status : 'needs_attention',
    confidence: typeof raw.confidence === 'number' ? raw.confidence : null,
    summary: raw.summary ?? '',
    issues: Array.isArray(raw.issues) ? raw.issues : [],
    advice: Array.isArray(raw.advice) ? raw.advice : [],
  }
}
