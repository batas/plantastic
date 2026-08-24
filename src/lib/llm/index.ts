import { getConfig, type LlmProvider } from '@/lib/settings'
import { getPlantDetail } from '@/lib/services/plants'
import { getOpbInfo, type OpbPlant } from '@/lib/opb'
import { chat, photosToImages, parseJsonLoose } from './client'
import type { CareLog, Photo, Plant, SensorReading } from '@/lib/db/schema'

export interface CarePlanResult {
  provider: string
  model: string
  plan: string
  generatedAt: number
  intervals?: Record<string, number>
}

export function parseCareIntervals(planText: string): CarePlanResult['intervals'] | undefined {
  const jsonMatch = planText.match(/```json\s*\n?(\{[\s\S]*?\})\s*\n?```/)
  if (!jsonMatch) return undefined
  try {
    const parsed = JSON.parse(jsonMatch[1]) as Record<string, unknown>
    const intervals = sanitizeIntervals(parsed)
    return Object.keys(intervals).length > 0 ? intervals : undefined
  } catch {
    return undefined
  }
}

export function stripJsonBlock(planText: string): string {
  return planText.replace(/\n*---\s*\n*```json\s*\n?\{[\s\S]*?\}\s*\n?```?\s*$/m, '').trim()
}

const TRUNCATION_NOTE = '\n\n> ⚠️ Plan został obcięty z powodu limitu tokenów. Spróbuj ponownie.'

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
    'ZACZNIJ OD KRÓTKIEGO PODSUMOWANIA — to najważniejsza sekcja:',
    '## 📌 Podsumowanie',
    'Maksymalnie 5 zwięzłych punktów (lista z myślnikami), zero lania wody:',
    '- stan rośliny w jednym zdaniu (np. ✅ Dobra kondycja / ⚠️ Przelana / 🔴 Wymaga interwencji)',
    '- najważniejszy problem lub jego brak',
    '- co zrobić w pierwszej kolejności i kiedy',
    '- zmiany harmonogramu vs dotychczasowy (jeśli są — podaj liczby, np. podlewanie co 7→5 dni)',
    'NIE pisz NIC przed tym nagłówkiem. Odpowiedź zaczyna się od "## 📌 Podsumowanie".',
    '',
    'DALEJ SZCZEGÓŁOWE SEKCJE (każda rozbudowana, po kilka akapitów):',
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
    '',
    '---',
    'DOSTOSUJ INTERWAŁY DO PORY ROKU (podane w danych): zimą wzrost jest spowolniony — wydłuż interwał podlewania i zaniechaj nawożenia; wiosną i latem roślina rośnie — skróć interwały i zwiększ nawożenie.',
    '',
    'PO PLANIE OZACZ KONIECZNIE BLOK JSON Z INTERWAŁAMI W FORMACIE:',
    '```json',
    '{',
    '  "waterIntervalDays": 7,',
    '  "fertilizeIntervalDays": 30,',
    '  "mistIntervalDays": 3,',
    '  "cleanIntervalDays": 14,',
    '  "rotateIntervalDays": 7',
    '}',
    '```',
    'Wartości to liczba dni między zabiegami. null = brak zmiany. Bądź precyzyjny na podstawie analizy.',
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

export function seasonName(date: Date = new Date()): string {
  const m = date.getMonth()
  return m >= 2 && m < 5 ? 'wiosna' : m >= 5 && m < 8 ? 'lato' : m >= 8 && m < 11 ? 'jesień' : 'zima'
}

function buildUserPrompt(plant: Plant, detail: NonNullable<Awaited<ReturnType<typeof getPlantDetail>>>, opb: OpbPlant | null, photoCount: number): string {
  const lastWater = detail?.careLogs.find((c) => c.kind === 'water')
  const lastFert = detail?.careLogs.find((c) => c.kind === 'fertilize')
  const lastRepotted = plant.lastRepottedAt ? Math.round((Date.now() / 1000 - plant.lastRepottedAt) / 86400) : null
  const potMaterialLabels: Record<string, string> = { terracotta: 'terakota', plastic: 'plastik', ceramic: 'ceramika', fabric: 'tkanina/mesh', other: 'inny' }
  const waterLabels: Record<string, string> = { tap: 'kranówka', filtered: 'przefiltrowana', distilled: 'destylowana', rain: 'deszczówka' }
  const lines = [
    `Roślina: ${plant.name}`,
    `Gatunek: ${plant.species ?? 'nieznany'}${plant.scientificName ? ` (${plant.scientificName})` : ''}`,
    plant.location ? `Lokalizacja: ${plant.location}` : null,
    `Pora roku: ${seasonName()} (dostosuj interwały pielęgnacji do sezonu)`,
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

const INTERVAL_KEYS = ['waterIntervalDays', 'fertilizeIntervalDays', 'mistIntervalDays', 'cleanIntervalDays', 'rotateIntervalDays'] as const

function sanitizeIntervals(parsed: Record<string, unknown>): Record<string, number> {
  const intervals: Record<string, number> = {}
  for (const k of INTERVAL_KEYS) {
    const v = parsed[k]
    if (typeof v === 'number' && Number.isFinite(v) && v > 0) intervals[k] = Math.round(v)
  }
  return intervals
}

/** Second-pass LLM extraction when the markdown JSON block is missing or malformed. */
async function repairIntervals(planText: string, provider: LlmProvider): Promise<Record<string, number>> {
  try {
    const repair = await chat(
      {
        system:
          'Wyciągasz dane strukturalne z tekstu. Odpowiadasz WYŁĄCZNIE obiektem JSON — bez komentarzy, bez markdown.',
        prompt: [
          'Poniżej plan pielęgnacji rośliny. Na podstawie sekcji o pielęgnacji ustal interwały zabiegów w dniach.',
          'Odpowiedz obiektem JSON z kluczami (pomiń klucze, których nie da się ustalić):',
          '{"waterIntervalDays":7,"fertilizeIntervalDays":30,"mistIntervalDays":3,"cleanIntervalDays":14,"rotateIntervalDays":7}',
          '',
          planText.slice(0, 8000),
        ].join('\n'),
        maxTokens: 512,
        json: true,
      },
      provider,
    )
    const parsed = parseJsonLoose<Record<string, unknown>>(repair.text)
    return parsed ? sanitizeIntervals(parsed) : {}
  } catch (err) {
    console.error('[llm] interval repair failed:', err instanceof Error ? err.message : err)
    return {}
  }
}

export async function generateCarePlan(plantId: number, provider?: LlmProvider, photoCount: number = 4): Promise<CarePlanResult> {
  const cfg = getConfig()
  const selected = provider ?? cfg.llm?.provider ?? 'ollama'
  if (!cfg.llm?.apiKey && selected !== 'ollama') {
    throw new Error(`Brak klucza API dla providera ${selected}. Skonfiguruj go w ustawieniach.`)
  }
  const detail = await getPlantDetail(plantId)
  if (!detail) throw new Error('Nie znaleziono rośliny')
  const opb = detail.plant.scientificName ? await getOpbInfo(detail.plant.scientificName) : null

  const result = await chat({
    system: buildSystemPrompt(),
    prompt: buildUserPrompt(detail.plant, detail, opb, photoCount),
    images: photosToImages(detail.photos, photoCount),
    maxTokens: 4096,
  }, selected)

  let plan = result.truncated ? result.text + TRUNCATION_NOTE : result.text
  const parsed = parseCareIntervals(plan)
  let intervals = parsed ? { ...parsed } : undefined
  if (!intervals && !result.truncated) {
    console.log('[llm] intervals block missing — trying repair extraction')
    const repaired = await repairIntervals(plan, selected)
    if (Object.keys(repaired).length > 0) intervals = repaired
  }
  if (intervals) {
    plan = stripJsonBlock(plan)
  }
  return { provider: result.provider, model: result.model, plan, generatedAt: Date.now(), intervals }
}

export async function generateCarePlanWithContext(plantId: number, provider?: LlmProvider): Promise<{ plan: CarePlanResult; context: unknown }> {
  const detail = await getPlantDetail(plantId)
  const opb = await getOpbInfo(detail?.plant.scientificName)
  const result = await generateCarePlan(plantId, provider)
  return { plan: result, context: { plant: detail?.plant.name, opb, careLogs: detail?.careLogs.map((c) => ({ kind: c.kind, at: c.createdAt })) } }
}

export type { CareLog, Photo, Plant, SensorReading }

export interface SensorCheckResult {
  action: 'water' | 'mist' | 'rotate' | 'none'
  reason: string
  urgency: 'high' | 'medium' | 'low'
  provider: string
  model: string
}

function buildSensorCheckPrompt(plant: Plant, detail: NonNullable<Awaited<ReturnType<typeof getPlantDetail>>>): string {
  const now = new Date()
  const season = seasonName(now)
  const lastWater = detail?.careLogs.find((c) => c.kind === 'water')
  const lastMist = detail?.careLogs.find((c) => c.kind === 'mist')
  const lastRotate = detail?.careLogs.find((c) => c.kind === 'rotate')

  const lines = [
    `Roślina: ${plant.name}`,
    `Gatunek: ${plant.species ?? 'nieznany'}${plant.scientificName ? ` (${plant.scientificName})` : ''}`,
    `Pora roku: ${season}, data: ${now.toLocaleDateString('pl-PL')}`,
    plant.location ? `Lokalizacja: ${plant.location}` : null,
    '',
    '[Ostatnie zabiegi]',
    `Ostatnie podlewanie: ${lastWater ? new Date(lastWater.createdAt * 1000).toLocaleString('pl-PL') : 'brak'}`,
    `Ostatnie zraszanie: ${lastMist ? new Date(lastMist.createdAt * 1000).toLocaleString('pl-PL') : 'brak'}`,
    `Ostatnie obracanie: ${lastRotate ? new Date(lastRotate.createdAt * 1000).toLocaleString('pl-PL') : 'brak'}`,
    '',
    buildSensorHistory(detail?.latestReadings ?? {}),
    '',
    'Oceń na podstawie powyższych danych czy roślina necesita zabiegu pielęgnacyjnego.',
    'Jeśli TAK — podaj jaki zabieg i dlaczego.',
    'Jeśli NIE — podaj dlaczego nic nie trzeba robić.',
  ]
  return lines.filter((l) => l != null).join('\n')
}

const SENSOR_CHECK_SYSTEM = [
  'Jesteś botanikiem ekspertem. Analizujesz dane z czujników wilgotności gleby, temperatury, wilgotności powietrza i światła.',
  'Twoim zadaniem jest podjęcie DECYZJI: czy roślina potrzebuje teraz zabiegu pielęgnacyjnego (podlewania, zraszania, obracania).',
  '',
  'Odpowiadaj TYLKO w formacie JSON (bez żadnego tekstu wokół):',
  '{',
  '  "action": "water" | "mist" | "rotate" | "none",',
  '  "reason": "krótkie wyjaśnienie po polsku (1-2 zdania)",',
  '  "urgency": "high" | "medium" | "low"',
  '}',
  '',
  'Zasady:',
  '- "water": wilgotność gleby niska lub spada poniżej optimum gatunkowego',
  '- "mist": wilgotność powietrza niska, roślina wymaga zraszania',
  '- "rotate": roślina nierówno rośnie (mierzono światło)',
  '- "none": parametry w normie, nic nie trzeba robić',
  '- "high": pilne (roślina może ucierpieć)', '- "medium": warto zrobić w ciągu 1-2 dni',
  '- "low": drobna korekta, nie pilne',
  'Bądź konkretny i opieraj się na danych z czujników.',
].join('\n')

export async function generateSensorReminder(plantId: number, provider?: LlmProvider): Promise<SensorCheckResult> {
  const cfg = getConfig()
  const selected = provider ?? cfg.llm?.provider ?? 'ollama'
  if (!cfg.llm?.apiKey && selected !== 'ollama') {
    throw new Error(`Brak klucza API dla providera ${selected}. Skonfiguruj go w ustawieniach.`)
  }
  const detail = await getPlantDetail(plantId)
  if (!detail) throw new Error('Nie znaleziono rośliny')

  const result = await chat({
    system: SENSOR_CHECK_SYSTEM,
    prompt: buildSensorCheckPrompt(detail.plant, detail),
    maxTokens: 1024,
  }, selected)

  const parsed = parseJsonLoose<{ action?: string; reason?: string; urgency?: string }>(result.text)
  const actions = ['water', 'mist', 'rotate', 'none'] as const
  const urgencies = ['high', 'medium', 'low'] as const
  return {
    action: parsed && actions.includes(parsed.action as typeof actions[number]) ? parsed.action as SensorCheckResult['action'] : 'none',
    reason: parsed?.reason ? String(parsed.reason) : 'Nie udało się sparsować odpowiedzi AI',
    urgency: parsed && urgencies.includes(parsed.urgency as typeof urgencies[number]) ? parsed.urgency as SensorCheckResult['urgency'] : 'low',
    provider: result.provider,
    model: result.model,
  }
}
