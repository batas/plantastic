export type CareType = "water" | "fertilize" | "mist" | "clean" | "rotate"

export const CARE_TYPES: CareType[] = ["water", "fertilize", "mist", "clean", "rotate"]

export const CARE_META: Record<CareType, { label: string; icon: string; short: string; intervalField: keyof PlantIntervalFields | null }> = {
  water: { label: "Podlewanie", icon: "💧", short: "Podlane", intervalField: "waterIntervalDays" },
  fertilize: { label: "Nawożenie", icon: "🧪", short: "Nawożone", intervalField: "fertilizeIntervalDays" },
  mist: { label: "Zraszanie", icon: "🌫️", short: "Zraszane", intervalField: "mistIntervalDays" },
  clean: { label: "Czyszczenie liści", icon: "🧹", short: "Czyszczone", intervalField: "cleanIntervalDays" },
  rotate: { label: "Obracanie", icon: "🔄", short: "Obracane", intervalField: "rotateIntervalDays" },
}

export interface PlantIntervalFields {
  waterIntervalDays: number | null
  fertilizeIntervalDays: number | null
  mistIntervalDays: number | null
  cleanIntervalDays: number | null
  rotateIntervalDays: number | null
}

export function isCareType(k: string): k is CareType {
  return (CARE_TYPES as string[]).includes(k)
}
