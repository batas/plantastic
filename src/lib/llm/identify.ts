import { getPlantDetail } from '@/lib/services/plants'
import { chat, parseJsonLoose, photosToImages, type ChatImage } from './client'

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

function parseJsonStrict<T>(text: string): T {
  const parsed = parseJsonLoose<T>(text)
  if (!parsed) {
    throw new Error(`LLM nie zwrócił poprawnego JSON. Odpowiedź: "${text.slice(0, 500)}"`)
  }
  return parsed
}

async function callVision(prompt: string, images: ChatImage[]): Promise<string> {
  const result = await chat({ prompt, images, maxTokens: 800, json: true })
  return result.text
}

export async function identifyPlant(image: ChatImage): Promise<PlantIdentification> {
  const text = await callVision(IDENTIFY_PROMPT, [image])
  const raw = parseJsonStrict<Partial<PlantIdentification>>(text)
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
  const images = photosToImages(detail.photos, 4)
  const text = await callVision(HEALTH_PROMPT(detail.plant.name, context), images)
  const raw = parseJsonStrict<Partial<HealthVerdict>>(text)
  return {
    status: raw.status === 'needs_attention' || raw.status === 'problems' || raw.status === 'healthy' ? raw.status : 'needs_attention',
    confidence: typeof raw.confidence === 'number' ? raw.confidence : null,
    summary: raw.summary ?? '',
    issues: Array.isArray(raw.issues) ? raw.issues : [],
    advice: Array.isArray(raw.advice) ? raw.advice : [],
  }
}
