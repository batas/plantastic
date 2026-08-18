"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import Markdown from "react-markdown"
import { formatDate, photoUrl } from "@/lib/format"
import { CARE_META, CARE_TYPES, type CareType } from "@/lib/care-types"

type Detail = {
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

type CareStatus = { type: CareType; dueAt: number | null; overdue: boolean; lastDoneAt: number | null }

type OpbGuide = {
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

const KIND_LABEL: Record<string, string> = {
  photo: "📷 Zdjęcie",
  care_plan: "🤖 Plan pielęgnacji",
  event: "📋 Zdarzenie",
  note: "📝 Notatka",
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
  opbGuide: OpbGuide | null
  sensorMappings: { id: number; plantId: number; topic: string; metric: string; source: string }[]
  deviceMappings: { id: number; plantId: number; haDeviceId: string; deviceName: string | null; createdAt: number }[]
  entityNames: Record<string, string>
}) {
  const router = useRouter()
  const { plant } = detail
  const [now] = useState(() => Date.now() / 1000)
  const [busyCare, setBusyCare] = useState<string | null>(null)
  const [planning, setPlanning] = useState(false)
  const [checking, setChecking] = useState(false)
  const [planError, setPlanError] = useState("")
  const [uploading, setUploading] = useState(false)
  const [photoError, setPhotoError] = useState("")
  const [caption, setCaption] = useState("")
  const [showAddNote, setShowAddNote] = useState(false)
  const [noteText, setNoteText] = useState("")
  const [topic, setTopic] = useState("")
  const [metric, setMetric] = useState("moisture")
  const [mappingMode, setMappingMode] = useState<"device" | "entity">("device")
  const [haEntities, setHaEntities] = useState<{ entity_id: string; state: string; friendly_name: string | null; area: string | null }[]>([])
  const [haDevices, setHaDevices] = useState<{ device: { id: string; name: string | null; manufacturer: string | null; model: string | null; area_name?: string | null }; sensors: { entity_id: string; device_class: string | null; state: string; unit: string | null }[] }[]>([])
  const [deviceFilter, setDeviceFilter] = useState("")
  const [areaFilter, setAreaFilter] = useState("")
  const [loadingTopics, setLoadingTopics] = useState(false)
  const [topicError, setTopicError] = useState("")
  const [sensorSuccess, setSensorSuccess] = useState("")
  const [reidentifying, setReidentifying] = useState(false)
  const [reidentifyError, setReidentifyError] = useState("")
  const [reidentifyResult, setReidentifyResult] = useState<{ identification: { scientificName: string | null; commonName: string | null; confidence: number | null }; opb: { pid: string; display_pid: string; scientific_name?: string; common_name?: string; alias?: string | null }[] } | null>(null)
  const [progressSteps, setProgressSteps] = useState<{ label: string; done: boolean }[]>([])
  const [progressElapsed, setProgressElapsed] = useState(0)
  const [progressLabel, setProgressLabel] = useState("")
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const isBusy = planning || checking

  useEffect(() => {
    if (isBusy) {
      setProgressElapsed(0)
      timerRef.current = setInterval(() => setProgressElapsed((p) => p + 1), 1000)
    } else {
      if (timerRef.current) clearInterval(timerRef.current)
      timerRef.current = null
      setProgressSteps([])
      setProgressLabel("")
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [isBusy])

  function startProgress(label: string, steps: string[]) {
    setProgressLabel(label)
    setProgressSteps(steps.map((s) => ({ label: s, done: false })))
  }

  function advanceProgress(index: number) {
    setProgressSteps((prev) => prev.map((s, i) => i <= index ? { ...s, done: true } : s))
  }

  const filteredHaDevices = haDevices.filter(
    (d) => {
      const matchesFilter = !deviceFilter ||
        d.device.name?.toLowerCase().includes(deviceFilter.toLowerCase()) ||
        d.device.manufacturer?.toLowerCase().includes(deviceFilter.toLowerCase()) ||
        d.device.id.toLowerCase().includes(deviceFilter.toLowerCase())
      const matchesArea = areaFilter === "" || d.device.area_name === areaFilter
      return matchesFilter && matchesArea
    }
  )

  const uniqueAreas = [...new Set(
    haDevices.map((d) => d.device.area_name).filter((a): a is string => !!a),
  )].sort()

  async function logCare(kind: CareType) {
    setBusyCare(kind)
    try {
      await fetch(`/api/plants/${plant.id}/care`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind }),
      })
      router.refresh()
    } finally {
      setBusyCare(null)
    }
  }

  async function generatePlan() {
    setPlanning(true)
    setPlanError("")
    startProgress("Generowanie planu pielęgnacji", [
      "Zbieranie danych rośliny...",
      "Pobieranie historii odczytów sensorów...",
      "Analiza przez AI...",
      "Zapisywanie planu...",
    ])
    advanceProgress(0)
    try {
      await new Promise((r) => setTimeout(r, 400))
      advanceProgress(1)
      await new Promise((r) => setTimeout(r, 1500))
      advanceProgress(2)
      const res = await fetch(`/api/plants/${plant.id}/care-plan`, { method: "POST" })
      advanceProgress(2)
      const data = await res.json()
      if (!res.ok) {
        setPlanError(data.error ?? "Błąd generowania planu")
        return
      }
      advanceProgress(3)
      await new Promise((r) => setTimeout(r, 300))
      router.refresh()
    } catch {
      setPlanError("Błąd połączenia")
    } finally {
      setPlanning(false)
    }
  }

  async function checkHealth() {
    setChecking(true)
    setPlanError("")
    startProgress("Przegląd stanu rośliny (Plant Doctor)", [
      "Ładowanie zdjęć i danych...",
      "Analiza wizualna przez AI...",
      "Ocena stanu zdrowia...",
      "Zapisywanie wyników...",
    ])
    advanceProgress(0)
    try {
      await new Promise((r) => setTimeout(r, 400))
      advanceProgress(1)
      await new Promise((r) => setTimeout(r, 1500))
      advanceProgress(2)
      const res = await fetch(`/api/plants/${plant.id}/health`, { method: "POST" })
      advanceProgress(2)
      const data = await res.json()
      if (!res.ok) {
        setPlanError(data.error ?? "Błąd przeglądu stanu")
        return
      }
      advanceProgress(3)
      await new Promise((r) => setTimeout(r, 300))
      router.refresh()
    } catch {
      setPlanError("Błąd połączenia")
    } finally {
      setChecking(false)
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

  async function addNote() {
    if (!noteText.trim()) return
    await fetch(`/api/plants/${plant.id}/timeline`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "note", title: "Notatka", content: noteText }),
    })
    setNoteText("")
    setShowAddNote(false)
    router.refresh()
  }

  async function addSensorMapping() {
    if (!topic.trim()) return
    try {
      const res = await fetch("/api/sensors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plantId: plant.id, topic: topic.trim(), metric }),
      })
      if (res.ok) {
        setTopic("")
        setSensorSuccess("Dodano czujnik")
        setTimeout(() => setSensorSuccess(""), 3000)
        router.refresh()
      }
    } catch {
      setTopicError("Błąd połączenia")
    }
  }

  async function reidentify(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setReidentifying(true)
    setReidentifyError("")
    setReidentifyResult(null)
    try {
      const form = new FormData()
      form.append("file", file)
      const res = await fetch("/api/identify", { method: "POST", body: form })
      const data = await res.json()
      if (!res.ok) {
        setReidentifyError(data.error ?? "Błąd identyfikacji")
        return
      }
      setReidentifyResult(data)
    } catch {
      setReidentifyError("Błąd połączenia")
    } finally {
      setReidentifying(false)
      e.target.value = ""
    }
  }

  async function applyReidentification(commonName: string | null, scientificName: string | null, opbId?: string) {
    const payload: Record<string, unknown> = {}
    if (commonName) payload.species = commonName
    if (scientificName) payload.scientificName = scientificName
    if (opbId) payload.opbId = opbId
    const res = await fetch(`/api/plants/${plant.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
    if (res.ok) {
      setReidentifyResult(null)
      router.refresh()
    }
  }

  async function addDeviceMappings(device: { device: { id: string; name: string | null }; sensors: { entity_id: string; device_class: string | null }[] }) {
    try {
      const res = await fetch("/api/device-mappings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plantId: plant.id, haDeviceId: device.device.id, deviceName: device.device.name ?? device.device.id }),
      })
      if (res.ok) {
        setSensorSuccess(`Mapowano urządzenie: ${device.device.name ?? device.device.id}`)
        setTimeout(() => setSensorSuccess(""), 3000)
        router.refresh()
      } else {
        const data = await res.json()
        setTopicError(data.error ?? "Błąd zapisu")
      }
    } catch {
      setTopicError("Błąd połączenia")
    }
  }

  async function loadTopics() {
    setLoadingTopics(true)
    setTopicError("")
    try {
      if (mappingMode === "entity") {
        const res = await fetch("/api/ha/entities?domain=sensor")
        const data = await res.json()
        if (!res.ok) { setTopicError(data.error ?? "Nie udało się pobrać encji z HA"); return }
        setHaEntities(Array.isArray(data) ? data : [])
      } else {
        const res = await fetch("/api/ha/devices")
        const data = await res.json()
        if (!res.ok) { setTopicError(data.error ?? "Nie udało się pobrać urządzeń z HA"); return }
        setHaDevices(Array.isArray(data) ? data : [])
      }
    } catch {
      setTopicError("Błąd połączenia z HA")
    } finally {
      setLoadingTopics(false)
    }
  }

  async function deletePlant() {
    if (!confirm(`Usunąć roślinę "${plant.name}"?`)) return
    await fetch(`/api/plants/${plant.id}`, { method: "DELETE" })
    router.push("/")
    router.refresh()
  }

  const btn = "rounded-lg px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
  const input = "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
  const careButtons: Record<CareType, { label: string; className: string }> = {
    water: { label: "💧 Podlane", className: "bg-sky-600 hover:bg-sky-700" },
    fertilize: { label: "🧪 Nawożone", className: "bg-emerald-600 hover:bg-emerald-700" },
    mist: { label: "🌫️ Zraszane", className: "bg-cyan-600 hover:bg-cyan-700" },
    clean: { label: "🧹 Czyszczone", className: "bg-amber-600 hover:bg-amber-700" },
    rotate: { label: "🔄 Obracane", className: "bg-indigo-600 hover:bg-indigo-700" },
  }

  return (
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
          <div className="mt-4 flex flex-wrap gap-2">
            {CARE_TYPES.map((kind) => (
              <button
                key={kind}
                onClick={() => logCare(kind)}
                disabled={busyCare !== null}
                className={`${btn} ${careButtons[kind].className}`}
              >
                {busyCare === kind ? "..." : careButtons[kind].label}
              </button>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button onClick={generatePlan} disabled={planning} className={`${btn} bg-violet-600 hover:bg-violet-700`}>
              {planning ? "Generowanie..." : "🤖 Generuj plan pielęgnacji"}
            </button>
            <button onClick={checkHealth} disabled={checking} className={`${btn} bg-rose-600 hover:bg-rose-700`}>
              {checking ? "Analiza..." : "🩺 Przegląd stanu (Plant Doctor)"}
            </button>
          </div>
          {planError && <p className="mt-2 text-sm text-red-600">{planError}</p>}
          {isBusy && progressSteps.length > 0 && (
            <div className="mt-3 rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-800/50">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-medium text-zinc-700 dark:text-zinc-200">{progressLabel}</p>
                <span className="text-xs text-zinc-400 tabular-nums">{progressElapsed}s</span>
              </div>
              <div className="mb-3 h-1.5 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
                <div
                  className="h-full rounded-full bg-violet-500 transition-all duration-500 ease-out"
                  style={{ width: `${Math.min((progressSteps.filter((s) => s.done).length / progressSteps.length) * 100, 95)}%` }}
                />
              </div>
              <div className="space-y-1.5">
                {progressSteps.map((s, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    {s.done ? (
                      <svg className="h-3.5 w-3.5 shrink-0 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                      </svg>
                    ) : i === progressSteps.findIndex((p) => !p.done) ? (
                      <svg className="h-3.5 w-3.5 shrink-0 animate-spin text-violet-500" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                    ) : (
                      <span className="h-3.5 w-3.5 shrink-0" />
                    )}
                    <span className={s.done ? "text-zinc-500 dark:text-zinc-400" : i === progressSteps.findIndex((p) => !p.done) ? "text-zinc-700 font-medium dark:text-zinc-200" : "text-zinc-400 dark:text-zinc-500"}>
                      {s.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-zinc-100 px-3 py-1.5 text-sm font-medium text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700">
              {reidentifying ? "🔍 Rozpoznawanie..." : "🔍 Rozpoznaj na nowo"}
              <input type="file" accept="image/*" className="hidden" onChange={reidentify} disabled={reidentifying} />
            </label>
            {reidentifyError && <p className="text-sm text-red-600">{reidentifyError}</p>}
          </div>
          {reidentifyResult && (
            <div className="mt-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-800/50">
              <p className="text-sm font-medium">Wynik rozpoznawania:</p>
              <p className="mt-1 text-sm">
                {reidentifyResult.identification.commonName ?? reidentifyResult.identification.scientificName ?? "Nie rozpoznano"}
                {reidentifyResult.identification.scientificName && <span className="italic text-zinc-500"> ({reidentifyResult.identification.scientificName})</span>}
                {reidentifyResult.identification.confidence != null && (
                  <span className="ml-2 text-xs text-zinc-400">(pewność {Math.round(reidentifyResult.identification.confidence * 100)}%)</span>
                )}
              </p>
              {reidentifyResult.opb.length > 0 && (
                <div className="mt-2 space-y-1">
                  {reidentifyResult.opb.map((r) => (
                    <button key={r.pid} onClick={() => applyReidentification(r.common_name ?? r.alias ?? null, r.scientific_name ?? r.display_pid, r.pid)} className="block w-full rounded border border-zinc-200 bg-white px-2 py-1 text-left text-xs hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800 dark:hover:bg-zinc-700">
                      {r.common_name ?? r.alias ?? r.display_pid} <span className="italic text-zinc-400">{r.scientific_name ?? r.display_pid}</span>
                    </button>
                  ))}
                </div>
              )}
              {!reidentifyResult.opb.length && reidentifyResult.identification.scientificName && (
                <button onClick={() => applyReidentification(reidentifyResult.identification.commonName, reidentifyResult.identification.scientificName)} className="mt-2 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700">
                  Zastosuj
                </button>
              )}
              <button onClick={() => setReidentifyResult(null)} className="mt-2 ml-2 text-xs text-zinc-400 hover:text-zinc-600">Anuluj</button>
            </div>
          )}
        </section>

        <section className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="mb-3 font-semibold">Następne zabiegi</h2>
          <div className="flex flex-wrap gap-2">
            {careStatus.length === 0 && <p className="text-sm text-zinc-400">Brak rośliny.</p>}
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
                : days <= 1
                  ? "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
                  : "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
              return (
                <span key={c.type} className={`rounded-full border px-3 py-1 text-sm ${cls}`}>
                  {meta.icon} {meta.label}: {c.overdue ? "🔴 zaległe" : days === 0 ? "dzisiaj" : `${days} dni`}
                </span>
              )
            })}
          </div>
        </section>

        <section className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="mb-3 font-semibold">Zdjęcia i zmiany</h2>
          <div className="flex gap-2">
            <input className={input} placeholder="Podpis zdjęcia" value={caption} onChange={(e) => setCaption(e.target.value)} />
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

        <section className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">Historia</h2>
            <button onClick={() => setShowAddNote((v) => !v)} className="text-sm text-emerald-600 hover:underline">
              + Notatka
            </button>
          </div>
          {showAddNote && (
            <div className="mb-3 flex gap-2">
              <textarea className={input} rows={2} placeholder="Notatka..." value={noteText} onChange={(e) => setNoteText(e.target.value)} />
              <button onClick={addNote} className="shrink-0 rounded-lg bg-emerald-600 px-3 text-sm font-medium text-white hover:bg-emerald-700">
                Dodaj
              </button>
            </div>
          )}
          <div className="space-y-3">
            {detail.timeline.map((entry) => (
              <div key={entry.id} className="rounded-lg border border-zinc-100 p-3 dark:border-zinc-800">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">
                    {KIND_LABEL[entry.kind] ?? entry.title ?? "Wpis"}
                    {entry.title && entry.kind !== "event" && entry.kind !== "note" && <span className="text-zinc-400"> — {entry.title}</span>}
                  </span>
                  <span className="text-xs text-zinc-400">{formatDate(entry.createdAt)}</span>
                </div>
                {entry.content && (
                  entry.dataJson && JSON.parse(entry.dataJson).format === "markdown" ? (
                    <div className="mt-1 space-y-2 text-sm text-zinc-600 dark:text-zinc-300 [&_h1]:text-base [&_h1]:font-bold [&_h2]:text-base [&_h2]:font-semibold [&_h3]:text-sm [&_h3]:font-semibold [&_li]:ml-4 [&_li]:list-disc [&_ol]:list-decimal [&_p]:mb-1 [&_strong]:font-semibold [&_ul]:list-disc">
                      <Markdown>{entry.content}</Markdown>
                    </div>
                  ) : (
                    <div className="mt-1 whitespace-pre-wrap text-sm text-zinc-600 dark:text-zinc-300">{entry.content}</div>
                  )
                )}
                {entry.photoId && <PhotoThumb photoId={entry.photoId} photos={detail.photos} />}
              </div>
            ))}
            {detail.timeline.length === 0 && <p className="text-sm text-zinc-400">Brak wpisów. Zaloguj podlewanie lub dodaj zdjęcie, żeby rozpocząć historię.</p>}
          </div>
        </section>
      </div>

      <div className="space-y-6">
        {opbGuide && (
          <section className="rounded-xl border border-zinc-200 bg-white p-5 text-sm dark:border-zinc-800 dark:bg-zinc-900">
            <h2 className="mb-3 font-semibold">🌿 Przewodnik pielęgnacji</h2>
            <dl className="space-y-2">
              {opbGuide.common_name && (
                <GuideRow k="Nazwa potoczna" v={opbGuide.common_name} />
              )}
              {opbGuide.family && <GuideRow k="Rodzina" v={opbGuide.family} />}
              {opbGuide.maintenance && <GuideRow k="Wymagania" v={opbGuide.maintenance} />}
              {opbGuide.growth_rate && <GuideRow k="Tempo wzrostu" v={opbGuide.growth_rate} />}
              {opbGuide.sunlight && opbGuide.sunlight.length > 0 && (
                <GuideRow k="Światło" v={Array.isArray(opbGuide.sunlight) ? opbGuide.sunlight.join(", ") : opbGuide.sunlight ?? ""} />
              )}
              {opbGuide.watering && opbGuide.watering.length > 0 && (
                <GuideRow k="Podlewanie" v={Array.isArray(opbGuide.watering) ? opbGuide.watering.join(", ") : opbGuide.watering ?? ""} />
              )}
              {typeof opbGuide.poisonous_to_humans === "number" && opbGuide.poisonous_to_humans > 0 && (
                <GuideRow k="⚠️ Toksyczna dla ludzi" v={`${opbGuide.poisonous_to_humans}/5`} />
              )}
              {typeof opbGuide.poisonous_to_pets === "number" && opbGuide.poisonous_to_pets > 0 && (
                <GuideRow k="⚠️ Toksyczna dla zwierząt" v={`${opbGuide.poisonous_to_pets}/5`} />
              )}
            </dl>
          </section>
        )}

        <section className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="mb-3 font-semibold">Czujniki</h2>
          <div className="space-y-2 text-sm">
            {["moisture", "temperature", "light"].map((m) => {
              const readings = detail.latestReadings[m]
              const latest = readings?.[0]
              const unit = m === "moisture" ? "%" : m === "temperature" ? "°C" : "lx"
              return (
                <div key={m} className="flex items-center justify-between">
                  <span className="text-zinc-500">{m}</span>
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
          <div className="mt-4 border-t border-zinc-100 pt-3 dark:border-zinc-800">
            <p className="mb-2 text-xs text-zinc-400">Mapuj czujnik HA do tej rośliny</p>
            <div className="mb-2 flex gap-1 rounded-lg border border-zinc-200 bg-zinc-100 p-1 dark:border-zinc-700 dark:bg-zinc-800">
              <button type="button" onClick={() => { setMappingMode("device"); setTopic("") }} className={`flex-1 rounded-md px-2 py-1 text-xs font-medium transition ${mappingMode === "device" ? "bg-white text-zinc-900 shadow dark:bg-zinc-700 dark:text-white" : "text-zinc-500 hover:text-zinc-700 dark:text-zinc-400"}`}>
                Urządzenie
              </button>
              <button type="button" onClick={() => { setMappingMode("entity"); setTopic("") }} className={`flex-1 rounded-md px-2 py-1 text-xs font-medium transition ${mappingMode === "entity" ? "bg-white text-zinc-900 shadow dark:bg-zinc-700 dark:text-white" : "text-zinc-500 hover:text-zinc-700 dark:text-zinc-400"}`}>
                Czujnik
              </button>
            </div>
            <div className="flex flex-col gap-2">
              {mappingMode === "entity" && (
                <div className="flex gap-2">
                  <input className={input + " flex-1"} placeholder="sensor.wilgotnosc" value={topic} onChange={(e) => setTopic(e.target.value)} list="sensor-topics" />
                  <button type="button" onClick={loadTopics} disabled={loadingTopics} className="shrink-0 rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-600 dark:hover:bg-zinc-800">
                    {loadingTopics ? "..." : "Przeglądaj"}
                  </button>
                </div>
              )}
              {mappingMode === "device" && (
                <button type="button" onClick={loadTopics} disabled={loadingTopics} className="rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-600 dark:hover:bg-zinc-800">
                  {loadingTopics ? "Szukam urządzeń..." : "Przeglądaj urządzenia HA"}
                </button>
              )}
              {topicError && <p className="text-xs text-red-600">{topicError}</p>}
              {sensorSuccess && <p className="text-xs text-emerald-600">{sensorSuccess}</p>}
              <datalist id="sensor-topics">
                {haEntities.map((e) => <option key={e.entity_id} value={e.entity_id}>{e.friendly_name ?? e.entity_id} ({e.state})</option>)}
              </datalist>
              {mappingMode === "entity" && (
                <div className="flex gap-2">
                  <select className={input} value={metric} onChange={(e) => setMetric(e.target.value)}>
                    <option value="moisture">Wilgotność</option>
                    <option value="temperature">Temperatura</option>
                  </select>
                  <button onClick={addSensorMapping} className="shrink-0 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700">
                    Dodaj
                  </button>
                </div>
              )}
              {mappingMode === "device" && haDevices.length > 0 && (
                <div className="space-y-1">
                  <div className="relative">
                    <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                    <input
                      className="w-full rounded-lg border border-zinc-300 bg-white py-2 pl-9 pr-3 text-sm dark:border-zinc-600 dark:bg-zinc-800"
                      placeholder="Filtruj urządzenia..."
                      value={deviceFilter}
                      onChange={(e) => setDeviceFilter(e.target.value)}
                    />
                  </div>
                  {uniqueAreas.length > 0 && (
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-zinc-500">Obszar:</label>
                       <select value={areaFilter ?? ""} onChange={(e) => setAreaFilter(e.target.value)} className="rounded border border-zinc-300 bg-white px-2 py-1 text-xs dark:border-zinc-600 dark:bg-zinc-800">
                        <option value="">Wszystkie</option>
                        {uniqueAreas.map((a) => <option key={a} value={a}>{a}</option>)}
                      </select>
                      {areaFilter && <button type="button" onClick={() => setAreaFilter("")} className="text-xs text-zinc-400 hover:text-zinc-600">wyczyść</button>}
                    </div>
                  )}
                  {filteredHaDevices.length === 0 && <p className="px-2 py-1 text-xs text-zinc-400">Brak wyników</p>}
                  {filteredHaDevices.map((d) => (
                    <button key={d.device.id} type="button" onClick={() => addDeviceMappings(d)} className="flex w-full flex-col gap-1 rounded-lg border border-zinc-200 px-3 py-2 text-left text-sm hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{d.device.name ?? d.device.model ?? d.device.id}</span>
                        <span className="text-xs text-zinc-400">{d.sensors.length} czujników</span>
                      </div>
                      {d.device.area_name && <span className="text-xs text-zinc-400">{d.device.area_name}</span>}
                      <div className="flex flex-wrap gap-1">
                        {d.sensors.map((s) => (
                          <span key={s.entity_id} className="rounded bg-zinc-200 px-1.5 py-0.5 text-xs text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300">
                            {s.device_class ?? s.entity_id.split(".").pop()} {s.state}{s.unit ? ` ${s.unit}` : ""}
                          </span>
                        ))}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
            {sensorMappings.length > 0 && (
              <div className="mt-3 border-t border-zinc-100 pt-3 dark:border-zinc-800">
                <p className="mb-1 text-xs text-zinc-400">Zmapowane czujniki</p>
                <div className="space-y-1">
                  {sensorMappings.map((m) => (
                    <div key={m.id} className="flex items-center justify-between rounded-lg bg-zinc-50 px-3 py-1.5 text-xs dark:bg-zinc-800/50">
                      <div className="min-w-0 flex-1">
                        <span className="font-medium">{m.metric}</span>
                        <span className="ml-2 text-zinc-500">{entityNames[m.topic] ?? m.topic}</span>
                        {entityNames[m.topic] && <span className="ml-1 truncate text-zinc-400">{m.topic}</span>}
                        <span className="ml-1 rounded bg-zinc-200 px-1 py-0.5 text-[10px] text-zinc-500 dark:bg-zinc-700">{m.source}</span>
                      </div>
                      <button type="button" onClick={async () => { await fetch(`/api/sensors?id=${m.id}`, { method: "DELETE" }); router.refresh() }} className="ml-2 shrink-0 text-zinc-400 hover:text-red-500">
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {deviceMappings.length > 0 && (
              <div className="mt-3 border-t border-zinc-100 pt-3 dark:border-zinc-800">
                <p className="mb-1 text-xs text-zinc-400">Zmapowane urządzenia</p>
                <div className="space-y-1">
                  {deviceMappings.map((d) => (
                    <div key={d.id} className="flex items-center justify-between rounded-lg bg-zinc-50 px-3 py-1.5 text-xs dark:bg-zinc-800/50">
                      <div className="min-w-0 flex-1">
                        <span className="font-medium">{d.deviceName ?? d.haDeviceId}</span>
                        <span className="ml-1 truncate text-zinc-400">{d.haDeviceId}</span>
                      </div>
                      <button type="button" onClick={async () => { await fetch(`/api/device-mappings?id=${d.id}`, { method: "DELETE" }); router.refresh() }} className="ml-2 shrink-0 text-zinc-400 hover:text-red-500">
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
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
              return (
                <li key={c.id}>
                  {meta.icon} {meta.label} — {formatDate(c.createdAt)}
                </li>
              )
            })}
            {detail.careLogs.length === 0 && <li>Brak logów.</li>}
          </ul>
        </section>
      </div>
    </div>
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

function PhotoThumb({ photoId, photos }: { photoId: number; photos: Detail["photos"] }) {
  const photo = photos.find((p) => p.id === photoId)
  if (!photo) return null
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={photoUrl(photo.thumbPath ?? photo.path) ?? ""} alt="" className="mt-2 h-28 w-full rounded-lg object-cover" />
  )
}
