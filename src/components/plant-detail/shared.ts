import type { CareType } from "@/lib/care-types"

export const KIND_LABEL: Record<string, string> = {
  photo: "📷 Zdjęcie",
  care_plan: "🤖 Plan pielęgnacji",
  event: "📋 Zdarzenie",
  note: "📝 Notatka",
}

export type Detail = {
  plant: {
    id: number
    name: string
    species: string | null
    scientificName: string | null
    location: string | null
    notes: string | null
    waterIntervalDays: number | null
    fertilizeIntervalDays: number | null
    mistIntervalDays: number | null
    cleanIntervalDays: number | null
    rotateIntervalDays: number | null
    carePlanDays: number | null
    sensorCheck: boolean | null
  }
  photos: { id: number; path: string; thumbPath: string | null; caption: string | null; createdAt: number }[]
  timeline: {
    id: number
    kind: string
    title: string | null
    content: string | null
    photoId: number | null
    dataJson: string | null
    createdAt: number
  }[]
  careLogs: { id: number; kind: string; amount: number | null; unit: string | null; notes: string | null; createdAt: number }[]
  latestReadings: Record<string, { value: number; unit: string | null; measuredAt: number }[]>
}

export type CareStatus = {
  type: CareType
  dueAt: number | null
  overdue: boolean
  lastDoneAt: number | null
  aiReason?: string
  aiUrgency?: "high" | "medium" | "low"
}

export interface IntervalChange {
  kind: string
  icon: string
  label: string
  before: number | null
  after: number
}

export type OpbGuide = {
  common_name?: string
  family?: string
  maintenance?: string
  growth_rate?: string
  sunlight?: string[] | string
  watering?: string[] | string
  image_url?: string
  poisonous_to_humans?: number
  poisonous_to_pets?: number
}

export const MARKDOWN_PROSE =
  "[&_h1]:text-base [&_h1]:font-bold [&_h2]:text-base [&_h2]:font-semibold [&_h3]:text-sm [&_h3]:font-semibold [&_li]:ml-4 [&_li]:list-disc [&_ol]:list-decimal [&_p]:mb-1 [&_strong]:font-semibold [&_ul]:list-disc"
