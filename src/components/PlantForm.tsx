"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import type { Plant } from "@/lib/db/schema"

interface OpbResult {
  pid: number
  scientific_name: string
  common_name?: string
  watering?: string[]
  sunlight?: string[]
}

export default function PlantForm({
  plant,
  prefill,
}: {
  plant?: Plant | null
  prefill?: { species?: string; scientificName?: string; opbId?: number }
}) {
  const router = useRouter()
  const [form, setForm] = useState({
    name: plant?.name ?? "",
    species: plant?.species ?? prefill?.species ?? "",
    scientificName: plant?.scientificName ?? prefill?.scientificName ?? "",
    opbId: plant?.opbId ?? prefill?.opbId ?? "",
    location: plant?.location ?? "",
    notes: plant?.notes ?? "",
    waterIntervalDays: plant?.waterIntervalDays != null ? String(plant.waterIntervalDays) : "",
    fertilizeIntervalDays: plant?.fertilizeIntervalDays != null ? String(plant.fertilizeIntervalDays) : "",
    mistIntervalDays: plant?.mistIntervalDays != null ? String(plant.mistIntervalDays) : "",
    cleanIntervalDays: plant?.cleanIntervalDays != null ? String(plant.cleanIntervalDays) : "",
    rotateIntervalDays: plant?.rotateIntervalDays != null ? String(plant.rotateIntervalDays) : "",
  })
  const [opbQuery, setOpbQuery] = useState("")
  const [opbResults, setOpbResults] = useState<OpbResult[]>([])
  const [opbError, setOpbError] = useState("")
  const [submitError, setSubmitError] = useState("")
  const [busy, setBusy] = useState(false)

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  async function searchOpb() {
    if (opbQuery.trim().length < 2) return
    setOpbError("")
    setOpbResults([])
    try {
      const res = await fetch(`/api/opb?q=${encodeURIComponent(opbQuery)}`)
      if (!res.ok) {
        const data = await res.json()
        setOpbError(data.error ?? "Błąd wyszukiwania")
        return
      }
      setOpbResults(await res.json())
    } catch {
      setOpbError("Błąd połączenia")
    }
  }

  function pickOpb(r: OpbResult) {
    setForm((f) => ({
      ...f,
      species: r.common_name ?? "",
      scientificName: r.scientific_name,
      opbId: String(r.pid),
    }))
    setOpbResults([])
    setOpbQuery(r.scientific_name)
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setSubmitError("")
    try {
      const payload = {
        ...form,
        opbId: form.opbId ? Number(form.opbId) : null,
        waterIntervalDays: form.waterIntervalDays ? Number(form.waterIntervalDays) : null,
        fertilizeIntervalDays: form.fertilizeIntervalDays ? Number(form.fertilizeIntervalDays) : null,
        mistIntervalDays: form.mistIntervalDays ? Number(form.mistIntervalDays) : null,
        cleanIntervalDays: form.cleanIntervalDays ? Number(form.cleanIntervalDays) : null,
        rotateIntervalDays: form.rotateIntervalDays ? Number(form.rotateIntervalDays) : null,
      }
      const res = await fetch(plant ? `/api/plants/${plant.id}` : "/api/plants", {
        method: plant ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setSubmitError(data?.error ?? "Błąd zapisu rośliny")
        return
      }
      router.push(`/plants/${data.id}`)
      router.refresh()
    } catch {
      setSubmitError("Błąd połączenia")
    } finally {
      setBusy(false)
    }
  }

  const input = "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
  const label = "mb-1 block text-sm font-medium text-zinc-600 dark:text-zinc-400"

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={label}>Nazwa *</label>
          <input className={input} value={form.name} onChange={(e) => set("name", e.target.value)} required />
        </div>
        <div>
          <label className={label}>Lokalizacja</label>
          <input className={input} value={form.location} onChange={(e) => set("location", e.target.value)} placeholder="np. salon, okno wschodnie" />
        </div>
      </div>

      <div>
        <label className={label}>Gatunek (wyszukaj w OpenPlantBook)</label>
        <div className="flex gap-2">
          <input
            className={input}
            value={opbQuery}
            onChange={(e) => setOpbQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), searchOpb())}
            placeholder="np. Monstera deliciosa"
          />
          <button type="button" onClick={searchOpb} className="shrink-0 rounded-lg bg-zinc-200 px-4 text-sm font-medium hover:bg-zinc-300 dark:bg-zinc-700 dark:hover:bg-zinc-600">
            Szukaj
          </button>
        </div>
        {opbError && <p className="mt-1 text-sm text-red-600">{opbError}</p>}
        {opbResults.length > 0 && (
          <ul className="mt-2 overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-700">
            {opbResults.map((r) => (
              <li key={r.pid}>
                <button
                  type="button"
                  onClick={() => pickOpb(r)}
                  className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800"
                >
                  <span>
                    {r.common_name ?? r.scientific_name} <span className="text-zinc-400 italic">{r.scientific_name}</span>
                  </span>
                  <span className="text-xs text-zinc-400">{r.watering?.join(", ")}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={label}>Nazwa potoczna</label>
          <input className={input} value={form.species} onChange={(e) => set("species", e.target.value)} />
        </div>
        <div>
          <label className={label}>Nazwa naukowa</label>
          <input className={input} value={form.scientificName} onChange={(e) => set("scientificName", e.target.value)} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={label}>Interwał podlewania (dni)</label>
          <input
            className={input}
            type="number"
            min={0}
            value={form.waterIntervalDays}
            onChange={(e) => set("waterIntervalDays", e.target.value)}
          />
        </div>
        <div>
          <label className={label}>Interwał nawożenia (dni)</label>
          <input
            className={input}
            type="number"
            min={0}
            value={form.fertilizeIntervalDays}
            onChange={(e) => set("fertilizeIntervalDays", e.target.value)}
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label className={label}>Interwał zraszania (dni)</label>
          <input className={input} type="number" min={0} value={form.mistIntervalDays} onChange={(e) => set("mistIntervalDays", e.target.value)} />
        </div>
        <div>
          <label className={label}>Czyszczenie liści (dni)</label>
          <input className={input} type="number" min={0} value={form.cleanIntervalDays} onChange={(e) => set("cleanIntervalDays", e.target.value)} />
        </div>
        <div>
          <label className={label}>Obracanie (dni)</label>
          <input className={input} type="number" min={0} value={form.rotateIntervalDays} onChange={(e) => set("rotateIntervalDays", e.target.value)} />
        </div>
      </div>

      <div>
        <label className={label}>Notatki</label>
        <textarea className={input} rows={3} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
      </div>

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {busy ? "Zapisywanie..." : plant ? "Zapisz zmiany" : "Dodaj roślinę"}
        </button>
        <button type="button" onClick={() => router.back()} className="rounded-lg px-4 py-2 text-sm font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800">
          Anuluj
        </button>
      </div>
      {submitError && <p className="text-sm text-red-600">{submitError}</p>}
    </form>
  )
}
