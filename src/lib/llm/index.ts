import { readFileSync } from 'node:fs'
import path from 'node:path'
import { Anthropic } from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import { getConfig, type LlmProvider, maskSecret } from '@/lib/settings'
import { getPhotosDir } from '@/lib/settings'
import { getPlantDetail } from '@/lib/services/plants'
import { getOpbInfo, type OpbPlant } from '@/lib/opb'
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
    'Jesteś doświadczonym botanikiem i ekspertem od pielęgnacji roślin domowych.',
    'Przygotuj SZCZEGÓŁOWY, ROZBUDOWANY plan pielęgnacji po polsku. Plan powinien mieć minimum 800 słów.',
    '',
    'Na podstawie danych o roślinie, jej historii pielęgnacji, odczytów czujników, informacji gatunkowych (OPB) oraz zdjęć:',
    '- Oceń aktualny stan rośliny (zdrowie, wielkość, kondycja liści, korzeni)',
    '- Analizuj trendy odczytów (wilgotność, temperatura, światło) i wyciągaj wnioski',
    '- Porównuj warunki środowiskowe z wymaganiami gatunku z OPB',
    '- Analizuj zdjęcia pod kątem: plam, etiolacji, szkodników, ubytków turgoru, koloru liści, stanu podłoża',
    '',
    'FORMAT MARKDOWN — używaj nagłówków (##, ###), list numerowanych (1. 2. 3.), pogrubień (**tekst**).',
    '',
    'WYMAGANE SEKCJE (każda rozbudowana, po kilka akapitów):',
    '## 🔍 Stan rośliny',
    'Szczegółowa ocena kondycji: liście (kolor, kształt, turgor), łodyga, korzenie, podłoże.',
    'Porównanie aktualnych parametrów z wymaganiami gatunku.',
    '',
    '## 📊 Analiza warunków',
    'Trendy odczytów czujników z ostatnich dni. Czy parametry są w zakresie optimum gatunkowego?',
    'Co oznaczają odchylenia i jakie mogą być konsekwencje.',
    '',
    '## 🚨 Problemy i ryzyka',
    'Wszystkie zidentyfikowane problemy: niedobory, nadmiary, potencjalne zagrożenia.',
    'Dla każdego problemu: przyczyna, objawy, stopień pilności.',
    '',
    '## ✅ Co zrobić teraz',
    'Konkretne, priorytetyzowane zadania na najbliższy tydzień z wyjaśnieniem dlaczego.',
    'Podlewanie, nawożenie, przesadzanie, zmiana stanowiska — co trzeba zrobić i kiedy.',
    '',
    '## 📅 Harmonogram na 4 tygodnie',
    'Tydzień po tygodniu: co robić, co obserwować, jakie zmiany planować.',
    '',
    '## 🔎 Obserwować pod kątem',
    'Na co zwracać uwagę w najbliższych dniach. Symptomy alarmowe wymagające natychmiastowej reakcji.',
  ].join('\n')
}

function buildSensorHistory(readings: Record<string, SensorReading[]>): string {
  const now = Date.now() / 1000
  const DAY = 86400
  const lines: string[] = []
  for (const [metric, rs] of Object.entries(readings)) {
    if (!rs.length) continue
    const label = metric === 'moisture' ? 'Wilgotność gleby' : metric === 'air_humidity' ? 'Wilgotność powietrza' : metric === 'temperature' ? 'Temperatura' : metric === 'light' ? 'Światło' : metric

    const daily: { date: string; avg: number; count: number }[] = []
    for (let d = 6; d >= 0; d--) {
      const dayStart = now - (d + 1) * DAY
      const dayEnd = now - d * DAY
      const dayReadings = rs.filter((r) => r.measuredAt >= dayStart && r.measuredAt < dayEnd)
      if (dayReadings.length > 0) {
        const avg = dayReadings.reduce((s, r) => s + r.value, 0) / dayReadings.length
        const dateStr = new Date((dayEnd - DAY / 2) * 1000).toLocaleDateString('pl-PL', { month: 'short', day: 'numeric' })
        daily.push({ date: dateStr, avg: Math.round(avg * 10) / 10, count: dayReadings.length })
      }
    }
    if (daily.length === 0) continue
    const vals = daily.map((d) => d.avg)
    const trend = vals.length >= 2 ? vals[vals.length - 1] - vals[0] : 0
    const trendStr = trend > 1 ? '↑ rośnie' : trend < -1 ? '↓ spada' : '→ stabilna'
    const unit = rs[0]?.unit ?? ''
    const current = rs[0]?.value
    lines.push(`${label}: ${current ?? '?'}${unit} (teraz), trend ${trendStr}`)
    if (daily.length >= 3) {
      lines.push(`  Historia (7 dni): ${daily.map((d) => `${d.date} ${d.avg}${unit}`).join(' → ')}`)
    }
  }
  return lines.length > 0 ? lines.join('\n') : 'Brak danych z czujników'
}

function buildOpbSection(opb: OpbPlant | null): string {
  if (!opb) return ''
  const parts: string[] = ['[Dane gatunku z Open Plant Book]']
  if (opb.common_name) parts.push(`Nazwa zwyczajowa: ${opb.common_name}`)
  if (opb.family) parts.push(`Rodzina: ${opb.family}`)
  if (opb.sunlight) parts.push(`Światło: ${Array.isArray(opb.sunlight) ? opb.sunlight.join(', ') : opb.sunlight}`)
  if (opb.watering) parts.push(`Podlewanie: ${Array.isArray(opb.watering) ? opb.watering.join(', ') : opb.watering}`)
  if (opb.maintenance) parts.push(`Pielęgnacja: ${opb.maintenance}`)
  if (opb.growth_rate) parts.push(`Tempo wzrostu: ${opb.growth_rate}`)
  if (opb.drought_tolerant != null) parts.push(`Odporność na suszę: ${opb.drought_tolerant ? 'tak' : 'nie'}`)
  if (opb.poisonous_to_pets != null) parts.push(`Trujące dla zwierząt: ${opb.poisonous_to_pets ? 'TAK ⚠️' : 'nie'}`)
  return parts.join('\n')
}

function buildUserPrompt(plant: Plant, detail: Awaited<ReturnType<typeof getPlantDetail>>, opb: OpbPlant | null, photoCount: number): string {
  const lastWater = detail?.careLogs.find((c) => c.kind === 'water')
  const lastFert = detail?.careLogs.find((c) => c.kind === 'fertilize')
  const lastRepotted = plant.lastRepottedAt ? Math.round((Date.now() / 1000 - plant.lastRepottedAt) / 86400) : null
  const potMaterialLabels: Record<string, string> = { terracotta: 'terakota', plastic: 'plastik', ceramic: 'ceramika', fabric: 'tkanina/mesh', other: 'inny' }
  const waterLabels: Record<string, string> = { tap: 'kranówka', filtered: 'przefiltrowana', distilled: 'destylowana', rain: 'deszczówka' }
  const lines = [
    `Roślina: ${plant.name}`,
    `Gatunek: ${plant.species ?? 'nieznany'}${plant.scientificName ? ` (${plant.scientificName})` : ''}`,
    plant.location ? `Lokalizacja: ${plant.location}` : null,
    plant.notes ? `Notatki: ${plant.notes}` : null,
    `Interwał podlewania: ${plant.waterIntervalDays ?? 'brak'} dni`,
    `Interwał nawożenia: ${plant.fertilizeIntervalDays ?? 'brak'} dni`,
    `Ostatnie podlewanie: ${lastWater ? new Date(lastWater.createdAt * 1000).toLocaleString('pl-PL') : 'brak'}`,
    `Ostatnie nawożenie: ${lastFert ? new Date(lastFert.createdAt * 1000).toLocaleString('pl-PL') : 'brak'}`,
    '',
    '[Fizyczne wymiary]',
    plant.potDiameterCm ? `Średnica doniczki: ${plant.potDiameterCm} cm` : null,
    plant.plantHeightCm ? `Wysokość rośliny: ${plant.plantHeightCm} cm` : null,
    plant.potMaterial ? `Materiał doniczki: ${potMaterialLabels[plant.potMaterial] ?? plant.potMaterial}` : null,
    plant.substrateType ? `Podłoże: ${plant.substrateType}` : null,
    lastRepotted != null ? `Ostatnie przesadzanie: ${lastRepotted} dni temu${lastRepotted < 42 ? ' (świeżo przesadzona — nie nawozić przez 4-6 tygodni)' : ''}` : null,
    plant.waterType ? `Rodzaj wody: ${waterLabels[plant.waterType] ?? plant.waterType}` : null,
    '',
    buildSensorHistory(detail?.latestReadings ?? {}),
    '',
    buildOpbSection(opb),
    '',
    `\nZdjęcia rośliny (ostatnie ${photoCount}):`,
  ]
  return lines.filter((l) => l != null).join('\n')
}

async function withOpenAi(plantId: number, photoCount: number, opb: OpbPlant | null): Promise<CarePlanResult> {
  const cfg = getConfig()
  const model = cfg.llm?.model ?? 'gpt-4o-mini'
  console.log(`[llm] openai: model=${model} apiKey=${maskSecret(cfg.llm?.apiKey)}`)
  const client = new OpenAI({ apiKey: cfg.llm?.apiKey })
  const detail = await getPlantDetail(plantId)
  const plant = detail!.plant
  const content: OpenAIContent = []
  content.push({ type: 'text', text: buildUserPrompt(plant, detail, opb, photoCount) })
  for (const photo of detail!.photos) {
    const { data, mime } = photoBase64(photo)
    content.push({ type: 'image_url', image_url: { url: `data:${mime};base64,${data}` } })
    if (content.length > photoCount) break
  }
  const res = await client.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: buildSystemPrompt() },
      { role: 'user', content },
    ],
    max_tokens: 4096,
  })
  const plan = res.choices[0]?.message?.content ?? ''
  const truncated = res.choices[0]?.finish_reason === 'length'
  return { provider: 'openai', model, plan: truncated ? plan + '\n\n> ⚠️ Plan został obcięty z powodu limitu tokenów. Spróbuj ponownie.' : plan, generatedAt: Date.now() }
}

async function withAnthropic(plantId: number, photoCount: number, opb: OpbPlant | null): Promise<CarePlanResult> {
  const cfg = getConfig()
  const model = cfg.llm?.model ?? 'claude-3-5-sonnet-latest'
  console.log(`[llm] anthropic: model=${model} apiKey=${maskSecret(cfg.llm?.apiKey)}`)
  const client = new Anthropic({ apiKey: cfg.llm?.apiKey })
  const detail = await getPlantDetail(plantId)
  const plant = detail!.plant
  const content: AnthropicContent = []
  content.push({ type: 'text', text: buildUserPrompt(plant, detail, opb, photoCount) })
  for (const photo of detail!.photos) {
    const { data, mime } = photoBase64(photo)
    content.push({ type: 'image', source: { type: 'base64', media_type: mime, data } })
    if (content.length > photoCount) break
  }
  const res = await client.messages.create({
    model,
    max_tokens: 4096,
    system: buildSystemPrompt(),
    messages: [{ role: 'user', content }],
  })
  const text = res.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
  const truncated = res.stop_reason === 'max_tokens'
  return { provider: 'anthropic', model, plan: truncated ? text + '\n\n> ⚠️ Plan został obcięty z powodu limitu tokenów. Spróbuj ponownie.' : text, generatedAt: Date.now() }
}

async function withOllama(plantId: number, photoCount: number, opb: OpbPlant | null): Promise<CarePlanResult> {
  const cfg = getConfig()
  const baseURL = cfg.llm?.baseUrl ?? 'http://localhost:11434/v1'
  const model = cfg.llm?.model ?? 'llava'
  console.log(`[llm] ollama: model=${model} baseURL=${baseURL}`)
  const client = new OpenAI({ baseURL, apiKey: 'ollama' })
  const detail = await getPlantDetail(plantId)
  const plant = detail!.plant
  const content: OpenAIContent = []
  content.push({ type: 'text', text: buildUserPrompt(plant, detail, opb, photoCount) })
  for (const photo of detail!.photos) {
    const { data, mime } = photoBase64(photo)
    content.push({ type: 'image_url', image_url: { url: `data:${mime};base64,${data}` } })
    if (content.length > photoCount) break
  }
  const res = await client.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: buildSystemPrompt() },
      { role: 'user', content },
    ],
    max_tokens: 4096,
  })
  const plan = res.choices[0]?.message?.content ?? ''
  const truncated = res.choices[0]?.finish_reason === 'length'
  return { provider: 'ollama', model, plan: truncated ? plan + '\n\n> ⚠️ Plan został obcięty z powodu limitu tokenów. Spróbuj ponownie.' : plan, generatedAt: Date.now() }
}

async function withLiteLLM(plantId: number, photoCount: number, opb: OpbPlant | null): Promise<CarePlanResult> {
  const cfg = getConfig()
  const base = (cfg.llm?.baseUrl ?? 'http://localhost:4000').replace(/\/+$/, '')
  const model = cfg.llm?.model ?? 'gpt-4o-mini'
  const apiKey = cfg.llm?.apiKey
  console.log(`[llm] litellm: model=${model} baseURL=${base} apiKey=${maskSecret(apiKey)}`)
  if (!apiKey) throw new Error('Brak klucza API dla LiteLLM. Skonfiguruj go w ustawieniach.')
  const detail = await getPlantDetail(plantId)
  const plant = detail!.plant
  const content: OpenAIContent = []
  content.push({ type: 'text', text: buildUserPrompt(plant, detail, opb, photoCount) })
  for (const photo of detail!.photos) {
    const { data, mime } = photoBase64(photo)
    content.push({ type: 'image_url', image_url: { url: `data:${mime};base64,${data}` } })
    if (content.length > photoCount) break
  }
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'x-litellm-api-key': apiKey,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: buildSystemPrompt() },
        { role: 'user', content },
      ],
      max_tokens: 4096,
    }),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`LiteLLM ${res.status}: ${err.slice(0, 300)}`)
  }
  const data = await res.json() as Record<string, unknown>
  const text = Array.isArray(data.choices) ? ((data.choices[0] as Record<string, unknown>)?.message as Record<string, unknown>)?.content ?? '' : ''
  const truncated = Array.isArray(data.choices) && ((data.choices[0] as Record<string, unknown>)?.finish_reason) === 'length'
  return { provider: 'litellm', model, plan: truncated ? String(text) + '\n\n> ⚠️ Plan został obcięty z powodu limitu tokenów. Spróbuj ponownie.' : String(text), generatedAt: Date.now() }
}

export async function generateCarePlan(plantId: number, provider?: LlmProvider, photoCount: number = 4): Promise<CarePlanResult> {
  const cfg = getConfig()
  const selected = provider ?? cfg.llm?.provider ?? 'ollama'
  if (!cfg.llm?.apiKey && selected !== 'ollama') {
    throw new Error(`Brak klucza API dla providera ${selected}. Skonfiguruj go w ustawieniach.`)
  }
  const detail = await getPlantDetail(plantId)
  const opb = detail?.plant?.scientificName ? await getOpbInfo(detail.plant.scientificName) : null
  if (selected === 'anthropic') return withAnthropic(plantId, photoCount, opb)
  if (selected === 'openai') return withOpenAi(plantId, photoCount, opb)
  if (selected === 'litellm') return withLiteLLM(plantId, photoCount, opb)
  return withOllama(plantId, photoCount, opb)
}

export async function generateCarePlanWithContext(plantId: number, provider?: LlmProvider): Promise<{ plan: CarePlanResult; context: unknown }> {
  const detail = await getPlantDetail(plantId)
  const opb = await getOpbInfo(detail?.plant.scientificName)
  const result = await generateCarePlan(plantId, provider)
  return { plan: result, context: { plant: detail?.plant.name, opb, careLogs: detail?.careLogs.map((c) => ({ kind: c.kind, at: c.createdAt })) } }
}

export type { CareLog, Photo, Plant, SensorReading }
