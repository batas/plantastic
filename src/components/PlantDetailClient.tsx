"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { formatDate, photoUrl } from "@/lib/format"
import { CARE_META, CARE_TYPES, type CareType } from "@/lib/care-types"
import SensorCharts from "./SensorCharts"
import { NextCareChips, TaskProgressBox, GuideCard } from "./plant-detail/parts"
import ReidentifyPanel from "./plant-detail/ReidentifyPanel"
import SensorMapper from "./plant-detail/SensorMapper"
import PlantTimeline from "./plant-detail/PlantTimeline"
import type { CareStatus, Detail } from "./plant-detail/shared"

const CARE_BUTTONS: Record<CareType, { label: string; className: string }> = {
  water: { label: "💧 Podlane", className: "bg-sky-600 hover:bg-sky-700" },
  fertilize: { label: "🧪 Nawożone", className: "bg-emerald-600 hover:bg-emerald-700" },
  mist: { label: "🌫️ Zraszane", className: "bg-cyan-600 hover:bg-cyan-700" },
  clean: { label: "🧹 Czyszczone", className: "bg-amber-600 hover:bg-amber-700" },
  rotate: { label: "🔄 Obracane", className: "bg-indigo-600 hover:bg-indigo-700" },
}

export default function PlantDetailClient({
  detail,
  careStatus,
  opbGuide,
  sensorMappings,
  deviceMappings,
  entityNames,
}: {
  detail: Detail
  careStatus: CareStatus[]
  opbGuide: React.ComponentProps<typeof GuideCard>["guide"] | null
  sensorMappings: { id: number; plantId: number; topic: string; metric: string; source: string }[]
  deviceMappings: { id: number; plantId: number; haDeviceId: string; deviceName: string | null; createdAt: number }[]
  entityNames: Record<string, string>
}) {
  const router = useRouter()
  const { plant } = detail
  const [busyCare, setBusyCare] = useState<string | null>(null)
  const [waterAmount, setWaterAmount] = useState("")
  const [activeTask, setActiveTask] = useState<{ id: number; kind: "care_plan" | "health"; steps: string[] } | null>(null)
  const [taskStatus, setTaskStatus] = useState<{ status: string; progress: number; error: string | null } | null>(null)
  const [taskElapsed, setTaskElapsed] = useState(0)
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const elapsedRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [taskError, setTaskError] = useState("")
  const [uploading, setUploading] = useState(false)
  const [photoError, setPhotoError] = useState("")
  const [caption, setCaption] = useState("")

  const isBusy = activeTask !== null

  useEffect(() => {
    if (!activeTask) return

    elapsedRef.current = setInterval(() => setTaskElapsed((p) => p + 1), 1000)

    const taskId = activeTask.id
    let interval = 1000
    let cancelled = false

    async function poll() {
      try {
        const res = await fetch(`/api/tasks/${taskId}`)
        const data = await res.json()
        if (cancelled) return
        setTaskStatus(data)
        if (data.status === "done" || data.status === "failed") {
          stopPolling()
          if (data.status === "done") router.refresh()
          return
        }
      } catch {
        if (cancelled) return
      }
      interval = Math.min(interval + 200, 3000)
      pollRef.current = setTimeout(poll, interval)
    }

    function stopPolling() {
      if (pollRef.current) clearTimeout(pollRef.current)
      if (elapsedRef.current) clearInterval(elapsedRef.current)
      pollRef.current = null
      elapsedRef.current = null
    }

    poll()
    return () => {
      cancelled = true
      stopPolling()
    }
  }, [activeTask, router])

  async function logCare(kind: CareType) {
    setBusyCare(kind)
    const amount = kind === "water" && waterAmount ? Number(waterAmount.replace(",", ".")) : undefined
    setWaterAmount("")
    try {
      await fetch(`/api/plants/${plant.id}/care`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, ...(amount != null && !Number.isNaN(amount) ? { amount, unit: "ml" } : {}) }),
      })
      router.refresh()
    } finally {
      setBusyCare(null)
    }
  }

  async function startLlmTask(kind: "care_plan" | "health") {
    setTaskError("")
    try {
      const res = await fetch(`/api/plants/${plant.id}/${kind === "care_plan" ? "care-plan" : "health"}`, { method: "POST" })
      const data = await res.json()
      if (!res.ok) {
        setTaskError(data.error ?? "Błąd zadania")
        return
      }
      setActiveTask({ id: data.taskId, kind, steps: data.steps })
      setTaskElapsed(0)
      setTaskStatus({ status: "pending", progress: 0, error: null })
    } catch {
      setTaskError("Błąd połączenia")
    }
  }

  async function uploadPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setPhotoError("")
    try {
      const form = new FormData()
      form.append("file", file)
      if (caption) form.append("caption", caption)
      const res = await fetch(`/api/plants/${plant.id}/photos`, { method: "POST", body: form })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setPhotoError(data?.error ?? "Błąd dodawania zdjęcia")
        return
      }
      setCaption("")
      router.refresh()
    } catch {
      setPhotoError("Błąd połączenia")
    } finally {
      setUploading(false)
      e.target.value = ""
    }
  }

  async function deletePlant() {
    if (!confirm(`Usunąć roślinę "${plant.name}"?`)) return
    await fetch(`/api/plants/${plant.id}`, { method: "DELETE" })
    router.push("/")
    router.refresh()
  }

  const btn = "rounded-lg px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
  const inputCls = "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"

  return (
    <>
      <div className="mt-4 grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <section className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h1 className="text-2xl font-bold">{plant.name}</h1>
                <p className="mt-1 text-zinc-500">
                  {plant.species ?? "Nieznany gatunek"}
                  {plant.scientificName && <span className="italic"> ({plant.scientificName})</span>}
                </p>
                {plant.location && <p className="text-sm text-zinc-400">📍 {plant.location}</p>}
                {plant.notes && <p className="mt-2 whitespace-pre-wrap text-sm">{plant.notes}</p>}
              </div>
              <div className="flex shrink-0 gap-2">
                <Link href={`/plants/${plant.id}/edit`} className="rounded-lg bg-zinc-200 px-3 py-1.5 text-sm font-medium hover:bg-zinc-300 dark:bg-zinc-700 dark:hover:bg-zinc-600">
                  Edytuj
                </Link>
                <button onClick={deletePlant} className="rounded-lg bg-red-100 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-200 dark:bg-red-900/40 dark:text-red-300">
                  Usuń
                </button>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              {CARE_TYPES.map((kind) => (
                <button
                  key={kind}
                  onClick={() => logCare(kind)}
                  disabled={busyCare !== null}
                  className={`${btn} ${CARE_BUTTONS[kind].className}`}
                >
                  {busyCare === kind ? "..." : CARE_BUTTONS[kind].label}
                </button>
              ))}
              <input
                type="text"
                inputMode="decimal"
                title="Ilość wody przy podlewaniu (ml)"
                placeholder="ml (opcjonalnie)"
                value={waterAmount}
                onChange={(e) => setWaterAmount(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") logCare("water") }}
                className="w-32 rounded-lg border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-800"
              />
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <button onClick={() => startLlmTask("care_plan")} disabled={isBusy} className={`${btn} bg-violet-600 hover:bg-violet-700`}>
                {activeTask?.kind === "care_plan" ? "Generowanie..." : "🔄 Regeneruj plan pielęgnacji"}
              </button>
              <button onClick={() => startLlmTask("health")} disabled={isBusy} className={`${btn} bg-rose-600 hover:bg-rose-700`}>
                {activeTask?.kind === "health" ? "Analiza..." : "🩺 Przegląd stanu (Plant Doctor)"}
              </button>
            </div>
            {taskError && <p className="mt-2 text-sm text-red-600">{taskError}</p>}
            {activeTask && (
              <TaskProgressBox
                kind={activeTask.kind}
                steps={activeTask.steps}
                progress={taskStatus?.progress ?? 0}
                elapsed={taskElapsed}
                error={taskStatus?.error ?? null}
              />
            )}
            <ReidentifyPanel plantId={plant.id} />
          </section>

          <section className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
            <h2 className="mb-3 font-semibold">Następne zabiegi</h2>
            <NextCareChips careStatus={careStatus} />
            {plant.carePlanDays != null && plant.carePlanDays > 0 && (
              <p className="mt-2 text-xs text-zinc-400">🤖 Auto-plan co {plant.carePlanDays} dni</p>
            )}
            {plant.sensorCheck && (
              <p className="mt-1 text-xs text-zinc-400">📡 Inteligentne przypomnienia z czujników (codziennie LLM)</p>
            )}
          </section>

          <section className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
            <h2 className="mb-3 font-semibold">Zdjęcia i zmiany</h2>
            <div className="flex gap-2">
              <input className={inputCls} placeholder="Podpis zdjęcia" value={caption} onChange={(e) => setCaption(e.target.value)} />
              <label className="shrink-0 cursor-pointer rounded-lg bg-zinc-200 px-3 py-2 text-sm font-medium hover:bg-zinc-300 dark:bg-zinc-700 dark:hover:bg-zinc-600">
                {uploading ? "..." : "📷 Dodaj zdjęcie"}
                <input type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/avif" className="hidden" onChange={uploadPhoto} />
              </label>
            </div>
            {photoError && <p className="mt-2 text-sm text-red-600">{photoError}</p>}
            {detail.photos.length > 0 ? (
              <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
                {detail.photos.map((p) => (
                  <a key={p.id} href={photoUrl(p.path) ?? ""} target="_blank" className="group relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={photoUrl(p.thumbPath ?? p.path) ?? ""} alt={p.caption ?? plant.name} className="h-24 w-full rounded-lg object-cover" />
                    {p.caption && (
                      <span className="absolute inset-x-0 bottom-0 truncate rounded-b-lg bg-black/60 px-1.5 py-0.5 text-xs text-white opacity-0 group-hover:opacity-100">
                        {p.caption}
                      </span>
                    )}
                  </a>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-sm text-zinc-400">Brak zdjęć.</p>
            )}
          </section>
        </div>

        <div className="space-y-6">
          {opbGuide && <GuideCard guide={opbGuide} />}

          <section className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
            <h2 className="mb-3 font-semibold">Czujniki</h2>
            <div className="space-y-2 text-sm">
              {(["moisture", "air_humidity", "temperature", "light"] as const).map((m) => {
                const latest = detail.latestReadings[m]?.[0]
                const unit = m === "moisture" || m === "air_humidity" ? "%" : m === "temperature" ? "°C" : "lx"
                const label = m === "moisture" ? "Wilgotność gleby" : m === "air_humidity" ? "Wilgotność powietrza" : m === "temperature" ? "Temperatura" : "Światło"
                return (
                  <div key={m} className="flex items-center justify-between">
                    <span className="text-zinc-500">{label}</span>
                    {latest ? (
                      <span>
                        <strong>{latest.value.toFixed(latest.value % 1 === 0 ? 0 : 1)}</strong> {unit}
                        <span className="ml-1 text-xs text-zinc-400">({formatDate(latest.measuredAt)})</span>
                      </span>
                    ) : (
                      <span className="text-zinc-400">brak</span>
                    )}
                  </div>
                )
              })}
            </div>
            <SensorMapper
              plantId={plant.id}
              sensorMappings={sensorMappings}
              deviceMappings={deviceMappings}
              entityNames={entityNames}
            />
          </section>

          <section className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
            <SensorCharts latestReadings={detail.latestReadings} />
          </section>

          <section className="rounded-xl border border-zinc-200 bg-white p-5 text-sm dark:border-zinc-800 dark:bg-zinc-900">
            <h2 className="mb-2 font-semibold">Pielęgnacja</h2>
            <p className="text-zinc-500">
              {CARE_TYPES.filter((t) => plant[`${t}IntervalDays` as keyof typeof plant] != null)
                .map((t) => `${CARE_META[t].icon} ${CARE_META[t].label.toLowerCase()} co ${plant[`${t}IntervalDays` as keyof typeof plant]} dni`)
                .join(" · ") || "Brak ustawionych interwałów."}
            </p>
            <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto text-xs text-zinc-400">
              {detail.careLogs.slice(0, 15).map((c) => {
                const meta = CARE_META[c.kind as CareType] ?? { icon: "❓", label: c.kind }
                const amount = c.amount != null ? ` (${c.amount}${c.unit ? ` ${c.unit}` : ""})` : ""
                return (
                  <li key={c.id}>
                    {meta.icon} {meta.label}{amount} — {formatDate(c.createdAt)}
                  </li>
                )
              })}
              {detail.careLogs.length === 0 && <li>Brak logów.</li>}
            </ul>
          </section>
        </div>
      </div>

      <PlantTimeline plantId={plant.id} entries={detail.timeline} photos={detail.photos} />
    </>
  )
}
