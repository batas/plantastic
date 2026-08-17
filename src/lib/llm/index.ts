import { readFileSync } from 'node:fs'
import path from 'node:path'
import { Anthropic } from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import { getConfig, type LlmProvider } from '@/lib/settings'
import { getPhotosDir } from '@/lib/settings'
import { getPlantDetail } from '@/lib/services/plants'
import { getOpbInfo } from '@/lib/opb'
import type { CareLog, Photo, Plant, SensorReading } from '@/lib/db/schema'

export interface CarePlanResult {
  provider: string
  model: string
  plan: string
  generatedAt: number
}

type OpenAIContent = OpenAI.Chat.Completions.ChatCompletionContentPart[]
type AnthropicContent = Anthropic.ContentBlockParam[]

function photoBase64(photo: Photo): { data: string; mime: "image/png" | "image/webp" | "image/jpeg" } {
  const abs = path.join(getPhotosDir(), photo.path)
  const buf = readFileSync(abs)
  const ext = photo.path.split('.').pop()?.toLowerCase() ?? 'jpg'
  const mime: "image/png" | "image/webp" | "image/jpeg" = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg'
  return { data: buf.toString('base64'), mime }
}

function buildSystemPrompt(): string {
  return [
    'Jesteś ekspertem od pielęgnacji roślin domowych.',
    'Na podstawie zdjęć rośliny, historii pielęgnacji, danych z czujników i metadanych gatunku',
    'przygotuj konkretny plan pielęgnacji po polsku.',
    'Uwzględnij: czy roślina wygląda zdrowo, symptomy problemów (żółknięcie, więdnięcie, szkodniki),',
    'zalecenia dot. podlewania i nawożenia w najbliższym tygodniu, poziom światła i temperaturę.',
    'Format: zwięzłe sekcje "Stan rośliny", "Co zrobić teraz", "Obserwować pod kątem".',
  ].join(' ')
}

function buildUserPrompt(plant: Plant, detail: Awaited<ReturnType<typeof getPlantDetail>>): string {
  const readings = Object.entries(detail?.latestReadings ?? {})
    .map(([metric, rs]) => `${metric}: ${rs[0] ? `${rs[0].value}${rs[0].unit ?? ''} (${new Date(rs[0].measuredAt * 1000).toISOString()})` : 'brak'}`)
    .join(', ')
  const lastWater = detail?.careLogs.find((c) => c.kind === 'water')
  const lastFert = detail?.careLogs.find((c) => c.kind === 'fertilize')
  return [
    `Roślina: ${plant.name}`,
    `Gatunek: ${plant.species ?? 'nieznany'}${plant.scientificName ? ` (${plant.scientificName})` : ''}`,
    plant.notes ? `Notatki: ${plant.notes}` : null,
    `Interwał podlewania: ${plant.waterIntervalDays ?? 'brak'} dni`,
    `Interwał nawożenia: ${plant.fertilizeIntervalDays ?? 'brak'} dni`,
    `Ostatnie podlewanie: ${lastWater ? new Date(lastWater.createdAt * 1000).toLocaleString('pl-PL') : 'brak'}`,
    `Ostatnie nawożenie: ${lastFert ? new Date(lastFert.createdAt * 1000).toLocaleString('pl-PL') : 'brak'}`,
    readings ? `Czujniki (ostatnie): ${readings}` : null,
    '\nZdjęcia rośliny:',
  ]
    .filter(Boolean)
    .join('\n')
}

async function withOpenAi(plantId: number): Promise<CarePlanResult> {
  const cfg = getConfig()
  const client = new OpenAI({ apiKey: cfg.llm?.apiKey })
  const model = cfg.llm?.model ?? 'gpt-4o-mini'
  const detail = await getPlantDetail(plantId)
  const plant = detail!.plant
  const content: OpenAIContent = []
  content.push({ type: 'text', text: buildUserPrompt(plant, detail) })
  for (const photo of detail!.photos) {
    const { data, mime } = photoBase64(photo)
    content.push({ type: 'image_url', image_url: { url: `data:${mime};base64,${data}` } })
    if (content.length >= 9) break
  }
  const res = await client.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: buildSystemPrompt() },
      { role: 'user', content },
    ],
    max_tokens: 1500,
  })
  return { provider: 'openai', model, plan: res.choices[0]?.message?.content ?? '', generatedAt: Date.now() }
}

async function withAnthropic(plantId: number): Promise<CarePlanResult> {
  const cfg = getConfig()
  const client = new Anthropic({ apiKey: cfg.llm?.apiKey })
  const model = cfg.llm?.model ?? 'claude-3-5-sonnet-latest'
  const detail = await getPlantDetail(plantId)
  const plant = detail!.plant
  const content: AnthropicContent = []
  content.push({ type: 'text', text: buildUserPrompt(plant, detail) })
  for (const photo of detail!.photos) {
    const { data, mime } = photoBase64(photo)
    content.push({ type: 'image', source: { type: 'base64', media_type: mime, data } })
    if (content.length >= 9) break
  }
  const res = await client.messages.create({
    model,
    max_tokens: 1500,
    system: buildSystemPrompt(),
    messages: [{ role: 'user', content }],
  })
  const text = res.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
  return { provider: 'anthropic', model, plan: text, generatedAt: Date.now() }
}

async function withOllama(plantId: number): Promise<CarePlanResult> {
  const cfg = getConfig()
  const baseURL = cfg.llm?.baseUrl ?? 'http://localhost:11434/v1'
  const client = new OpenAI({ baseURL, apiKey: 'ollama' })
  const model = cfg.llm?.model ?? 'llava'
  const detail = await getPlantDetail(plantId)
  const plant = detail!.plant
  const content: OpenAIContent = []
  content.push({ type: 'text', text: buildUserPrompt(plant, detail) })
  for (const photo of detail!.photos) {
    const { data, mime } = photoBase64(photo)
    content.push({ type: 'image_url', image_url: { url: `data:${mime};base64,${data}` } })
    if (content.length >= 6) break
  }
  const res = await client.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: buildSystemPrompt() },
      { role: 'user', content },
    ],
  })
  return { provider: 'ollama', model, plan: res.choices[0]?.message?.content ?? '', generatedAt: Date.now() }
}

async function withLiteLLM(plantId: number): Promise<CarePlanResult> {
  const cfg = getConfig()
  const baseURL = cfg.llm?.baseUrl ?? 'http://localhost:4000'
  const client = new OpenAI({ baseURL, apiKey: cfg.llm?.apiKey ?? 'litellm' })
  const model = cfg.llm?.model ?? 'gpt-4o-mini'
  const detail = await getPlantDetail(plantId)
  const plant = detail!.plant
  const content: OpenAIContent = []
  content.push({ type: 'text', text: buildUserPrompt(plant, detail) })
  for (const photo of detail!.photos) {
    const { data, mime } = photoBase64(photo)
    content.push({ type: 'image_url', image_url: { url: `data:${mime};base64,${data}` } })
    if (content.length >= 8) break
  }
  const res = await client.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: buildSystemPrompt() },
      { role: 'user', content },
    ],
    max_tokens: 1500,
  })
  return { provider: 'litellm', model, plan: res.choices[0]?.message?.content ?? '', generatedAt: Date.now() }
}

export async function generateCarePlan(plantId: number, provider?: LlmProvider): Promise<CarePlanResult> {
  const cfg = getConfig()
  const selected = provider ?? cfg.llm?.provider ?? 'ollama'
  if (!cfg.llm?.apiKey && selected !== 'ollama' && selected !== 'litellm') {
    throw new Error(`Brak klucza API dla providera ${selected}. Skonfiguruj go w ustawieniach.`)
  }
  if (selected === 'anthropic') return withAnthropic(plantId)
  if (selected === 'openai') return withOpenAi(plantId)
  if (selected === 'litellm') return withLiteLLM(plantId)
  return withOllama(plantId)
}

export async function generateCarePlanWithContext(plantId: number, provider?: LlmProvider): Promise<{ plan: CarePlanResult; context: unknown }> {
  const detail = await getPlantDetail(plantId)
  const opb = await getOpbInfo(detail?.plant.scientificName)
  const result = await generateCarePlan(plantId, provider)
  return { plan: result, context: { plant: detail?.plant.name, opb, careLogs: detail?.careLogs.map((c) => ({ kind: c.kind, at: c.createdAt })) } }
}

export type { CareLog, Photo, Plant, SensorReading }
