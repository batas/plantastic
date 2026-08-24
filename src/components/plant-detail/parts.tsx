"use client"

import { useState } from "react"
import { CARE_META } from "@/lib/care-types"
import type { CareStatus, IntervalChange, OpbGuide } from "./shared"

export function TaskProgressBox({
  kind,
  steps,
  progress,
  elapsed,
  error,
}: {
  kind: "care_plan" | "health"
  steps: string[]
  progress: number
  elapsed: number
  error: string | null
}) {
  return (
    <div className="mt-3 rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-800/50">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-medium text-zinc-700 dark:text-zinc-200">
          {kind === "care_plan" ? "Generowanie planu pielęgnacji" : "Przegląd stanu rośliny"}
        </p>
        <span className="text-xs text-zinc-400 tabular-nums">{elapsed}s</span>
      </div>
      <div className="mb-3 h-1.5 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
        <div
          className="h-full rounded-full bg-violet-500 transition-all duration-500 ease-out"
          style={{ width: `${Math.min(progress, 95)}%` }}
        />
      </div>
      <div className="space-y-1.5">
        {steps.map((step, i) => {
          const stepPercent = (i / steps.length) * 100
          const nextStepPercent = ((i + 1) / steps.length) * 100
          const done = progress >= nextStepPercent
          const current = !done && progress >= stepPercent
          return (
            <div key={i} className="flex items-center gap-2 text-xs">
              {done ? (
                <svg className="h-3.5 w-3.5 shrink-0 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
              ) : current ? (
                <svg className="h-3.5 w-3.5 shrink-0 animate-spin text-violet-500" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : (
                <span className="h-3.5 w-3.5 shrink-0" />
              )}
              <span className={done ? "text-zinc-500 dark:text-zinc-400" : current ? "text-zinc-700 font-medium dark:text-zinc-200" : "text-zinc-400 dark:text-zinc-500"}>
                {step}
              </span>
            </div>
          )
        })}
      </div>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  )
}

export function NextCareChips({ careStatus }: { careStatus: CareStatus[] }) {
  const [now] = useState(() => Date.now() / 1000)
  return (
    <div className="flex flex-wrap gap-2">
      {careStatus.length === 0 && <p className="text-sm text-zinc-400">Brak danych.</p>}
      {careStatus.map((c) => {
        const meta = CARE_META[c.type]
        if (!c.dueAt) {
          return (
            <span key={c.type} className="rounded-full border border-zinc-200 px-3 py-1 text-sm text-zinc-400 dark:border-zinc-700">
              {meta.icon} {meta.label}: —
            </span>
          )
        }
        const days = Math.ceil((c.dueAt - now) / 86400)
        const cls = c.overdue
          ? "border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300"
          : c.aiReason
            ? "border-violet-300 bg-violet-50 text-violet-700 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-300"
            : days <= 1
              ? "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
              : "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
        return (
          <span
            key={c.type}
            title={c.aiReason ? `🤖 AI zaleca: ${c.aiReason}` : undefined}
            className={`rounded-full border px-3 py-1 text-sm ${cls}`}
          >
            {meta.icon} {meta.label}:{" "}
            {c.overdue ? "🔴 zaległe" : days === 0 ? "dzisiaj" : `${days} dni`}
            {c.aiReason && <span className="ml-1" title={`AI zaleca: ${c.aiReason}`}>🤖</span>}
          </span>
        )
      })}
    </div>
  )
}

export function IntervalChangeChips({ changes }: { changes: IntervalChange[] }) {
  if (changes.length === 0) return null
  return (
    <div className="mt-1 flex flex-wrap gap-1.5">
      {changes.map((ch, i) => (
        <span key={`${ch.kind}-${i}`} className="rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-xs text-violet-700 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-300">
          🤖 {ch.icon} {ch.before != null ? `${ch.before} → ${ch.after}` : ch.after} dni
        </span>
      ))}
    </div>
  )
}

export function GuideCard({ guide }: { guide: OpbGuide }) {
  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-5 text-sm dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="mb-3 font-semibold">🌿 Przewodnik pielęgnacji</h2>
      <dl className="space-y-2">
        {guide.common_name && <GuideRow k="Nazwa potoczna" v={guide.common_name} />}
        {guide.family && <GuideRow k="Rodzina" v={guide.family} />}
        {guide.maintenance && <GuideRow k="Wymagania" v={guide.maintenance} />}
        {guide.growth_rate && <GuideRow k="Tempo wzrostu" v={guide.growth_rate} />}
        {guide.sunlight && guide.sunlight.length > 0 && (
          <GuideRow k="Światło" v={Array.isArray(guide.sunlight) ? guide.sunlight.join(", ") : guide.sunlight ?? ""} />
        )}
        {guide.watering && guide.watering.length > 0 && (
          <GuideRow k="Podlewanie" v={Array.isArray(guide.watering) ? guide.watering.join(", ") : guide.watering ?? ""} />
        )}
        {typeof guide.poisonous_to_humans === "number" && guide.poisonous_to_humans > 0 && (
          <GuideRow k="⚠️ Toksyczna dla ludzi" v={`${guide.poisonous_to_humans}/5`} />
        )}
        {typeof guide.poisonous_to_pets === "number" && guide.poisonous_to_pets > 0 && (
          <GuideRow k="⚠️ Toksyczna dla zwierząt" v={`${guide.poisonous_to_pets}/5`} />
        )}
      </dl>
    </section>
  )
}

function GuideRow({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex gap-2">
      <dt className="shrink-0 font-medium text-zinc-500">{k}:</dt>
      <dd>{v}</dd>
    </div>
  )
}
