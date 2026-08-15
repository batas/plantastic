"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { photoUrl } from "@/lib/format"
import { CARE_META, type CareType } from "@/lib/care-types"

export interface CareStatus {
  type: CareType
  dueAt: number | null
  overdue: boolean
  lastDoneAt: number | null
}

export interface DashboardPlantCard {
  plant: { id: number; name: string; species: string | null; location: string | null }
  photo: { thumbPath: string | null } | null
  care: CareStatus[]
  moisture: number | null
  temperature: number | null
  light: number | null
}

export default function PlantCard({ item }: { item: DashboardPlantCard }) {
  const router = useRouter()
  const [busy, setBusy] = useState<CareType | null>(null)
  const [now] = useState(() => Date.now() / 1000)
  const plant = item.plant

  async function log(kind: CareType) {
    setBusy(kind)
    try {
      await fetch(`/api/plants/${plant.id}/care`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind }),
      })
      router.refresh()
    } finally {
      setBusy(null)
    }
  }

  const dueChips = item.care
    .filter((c) => c.dueAt)
    .sort((a, b) => (a.overdue === b.overdue ? (a.dueAt ?? 0) - (b.dueAt ?? 0) : a.overdue ? -1 : 1))

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <a href={`/plants/${plant.id}`} className="flex items-start gap-3">
        {item.photo?.thumbPath ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photoUrl(item.photo.thumbPath) ?? ""}
            alt={plant.name}
            className="h-16 w-16 shrink-0 rounded-lg object-cover"
          />
        ) : (
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-2xl dark:bg-emerald-900/40">
            🌿
          </div>
        )}
        <div className="min-w-0">
          <h3 className="truncate font-semibold">{plant.name}</h3>
          <p className="truncate text-sm text-zinc-500">{plant.species ?? "Nieznany gatunek"}</p>
          {plant.location && <p className="text-xs text-zinc-400">📍 {plant.location}</p>}
        </div>
      </a>

      <div className="mt-3 flex flex-wrap gap-1.5 text-xs">
        {item.moisture !== null && (
          <span className="rounded-full bg-sky-100 px-2 py-0.5 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300">
            💧 {item.moisture.toFixed(0)}%
          </span>
        )}
        {item.temperature !== null && (
          <span className="rounded-full bg-orange-100 px-2 py-0.5 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300">
            🌡 {item.temperature.toFixed(1)}°C
          </span>
        )}
        {item.light !== null && (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
            ☀️ {Math.round(item.light)} lx
          </span>
        )}
      </div>

      {dueChips.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
          {dueChips.slice(0, 3).map((c) => {
            const meta = CARE_META[c.type]
            const days = Math.ceil((c.dueAt! - now) / 86400)
            const cls = c.overdue
              ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"
              : days <= 1
                ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
                : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
            return (
              <span key={c.type} className={`rounded-full px-2 py-0.5 ${cls}`}>
                {meta.icon} {c.overdue ? "zaległe" : days === 0 ? "dzisiaj" : `${days} dni`}
              </span>
            )
          })}
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {(["water", "fertilize", "mist", "clean", "rotate"] as CareType[]).map((kind) => {
          const status = item.care.find((c) => c.type === kind)
          const active = !status || !status.dueAt || status.dueAt > now + 24 * 3600
          if (!active && kind !== "water" && kind !== "fertilize") return null
          const meta = CARE_META[kind]
          const btnCls =
            kind === "water"
              ? "bg-sky-600 hover:bg-sky-700"
              : kind === "fertilize"
                ? "bg-emerald-600 hover:bg-emerald-700"
                : "bg-zinc-600 hover:bg-zinc-700"
          return (
            <button
              key={kind}
              onClick={() => log(kind)}
              disabled={busy !== null}
              className={`flex-1 rounded-lg px-2 py-1.5 text-sm font-medium text-white disabled:opacity-50 ${btnCls}`}
            >
              {busy === kind ? "..." : `${meta.icon} ${meta.short}`}
            </button>
          )
        })}
      </div>
    </div>
  )
}
