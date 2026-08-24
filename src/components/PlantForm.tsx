"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import type { Plant } from "@/lib/db/schema"

interface OpbResult {
  pid: string
  display_pid: string
  scientific_name?: string
  common_name?: string
  alias?: string | null
  watering?: string[] | string
  sunlight?: string[] | string
}

interface PendingPhoto {
  data: string
  name: string
  type: string
}

export default function PlantForm({
  plant,
  prefill,
}: {
  plant?: Plant | null
  prefill?: { species?: string; scientificName?: string; opbId?: string }
}) {
  const router = useRouter()
  const pendingPhotoRef = useRef<PendingPhoto | null>(null)
  const [pendingPreview, setPendingPreview] = useState<string | null>(null)
  const [form, setForm] = useState({
    name: plant?.name ?? "",
    species: plant?.species ?? prefill?.species ?? "",
    scientificName: plant?.scientificName ?? prefill?.scientificName ?? "",
    opbId: plant?.opbId ?? prefill?.opbId ?? "",
    notes: plant?.notes ?? "",
    waterIntervalDays: plant?.waterIntervalDays != null ? String(plant.waterIntervalDays) : "",
    fertilizeIntervalDays: plant?.fertilizeIntervalDays != null ? String(plant.fertilizeIntervalDays) : "",
    mistIntervalDays: plant?.mistIntervalDays != null ? String(plant.mistIntervalDays) : "",
    cleanIntervalDays: plant?.cleanIntervalDays != null ? String(plant.cleanIntervalDays) : "",
    rotateIntervalDays: plant?.rotateIntervalDays != null ? String(plant.rotateIntervalDays) : "",
    potDiameterCm: plant?.potDiameterCm != null ? String(plant.potDiameterCm) : "",
    plantHeightCm: plant?.plantHeightCm != null ? String(plant.plantHeightCm) : "",
    potMaterial: plant?.potMaterial ?? "",
    substrateType: plant?.substrateType ?? "",
    lastRepottedAt: plant?.lastRepottedAt ? new Date(plant.lastRepottedAt * 1000).toISOString().slice(0, 10) : "",
    waterType: plant?.waterType ?? "",
    carePlanDays: plant?.carePlanDays != null ? String(plant.carePlanDays) : "",
    sensorCheck: plant?.sensorCheck ?? false,
  })
  const [opbQuery, setOpbQuery] = useState("")
  const [opbResults, setOpbResults] = useState<OpbResult[]>([])
  const [opbError, setOpbError] = useState("")
  const [submitError, setSubmitError] = useState("")
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    function loadPendingPhoto() {
      try {
        const raw = sessionStorage.getItem("pendingPhoto")
        if (raw) {
          const photo = JSON.parse(raw) as PendingPhoto
          pendingPhotoRef.current = photo
          setPendingPreview(photo.data)
          sessionStorage.removeItem("pendingPhoto")
        }
      } catch {}
    }
    // defer to a task so we don't setState synchronously inside the effect body
    const t = setTimeout(loadPendingPhoto, 0)
    return () => clearTimeout(t)
  }, [])

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
      species: r.common_name ?? r.alias ?? "",
      scientificName: r.scientific_name ?? r.display_pid,
      opbId: r.pid,
    }))
    setOpbResults([])
    setOpbQuery(r.scientific_name ?? r.display_pid)
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setSubmitError("")
    try {
      const payload = {
        ...form,
        opbId: form.opbId || null,
        waterIntervalDays: form.waterIntervalDays ? Number(form.waterIntervalDays) : null,
        fertilizeIntervalDays: form.fertilizeIntervalDays ? Number(form.fertilizeIntervalDays) : null,
        mistIntervalDays: form.mistIntervalDays ? Number(form.mistIntervalDays) : null,
        cleanIntervalDays: form.cleanIntervalDays ? Number(form.cleanIntervalDays) : null,
        rotateIntervalDays: form.rotateIntervalDays ? Number(form.rotateIntervalDays) : null,
        potDiameterCm: form.potDiameterCm ? Number(form.potDiameterCm) : null,
        plantHeightCm: form.plantHeightCm ? Number(form.plantHeightCm) : null,
        potMaterial: form.potMaterial || null,
        substrateType: form.substrateType || null,
        lastRepottedAt: form.lastRepottedAt ? Math.floor(new Date(form.lastRepottedAt).getTime() / 1000) : null,
        waterType: form.waterType || null,
        carePlanDays: form.carePlanDays ? Number(form.carePlanDays) : null,
        sensorCheck: form.sensorCheck,
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
      if (pendingPhotoRef.current && data.id) {
        try {
          const bin = atob(pendingPhotoRef.current.data.split(",")[1])
          const arr = new Uint8Array(bin.length)
          for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i)
          const blob = new Blob([arr], { type: pendingPhotoRef.current.type })
          const fd = new FormData()
          fd.append("file", blob, pendingPhotoRef.current.name)
          await fetch(`/api/plants/${data.id}/photos`, { method: "POST", body: fd })
        } catch {}
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
      {pendingPreview && (
        <div className="rounded-lg border border-dashed border-emerald-300 bg-emerald-50 p-3 dark:border-emerald-700 dark:bg-emerald-950/30">
          <p className="mb-2 text-xs font-medium text-emerald-700 dark:text-emerald-300">📷 Zdjęcie z rozpoznania zostanie dodane po zapisaniu</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={pendingPreview} alt="Podgląd" className="h-24 rounded-lg object-cover" />
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={label}>Nazwa *</label>
          <input className={input} value={form.name} onChange={(e) => set("name", e.target.value)} required />
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
                    {r.common_name ?? r.alias ?? r.display_pid} <span className="text-zinc-400 italic">{r.scientific_name ?? r.display_pid}</span>
                  </span>
                  <span className="text-xs text-zinc-400">{Array.isArray(r.watering) ? r.watering.join(", ") : r.watering ?? ""}</span>
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

      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label className={label}>Średnica doniczki (cm)</label>
          <input className={input} type="number" min={0} value={form.potDiameterCm} onChange={(e) => set("potDiameterCm", e.target.value)} placeholder="np. 17" />
        </div>
        <div>
          <label className={label}>Wysokość rośliny (cm)</label>
          <input className={input} type="number" min={0} value={form.plantHeightCm} onChange={(e) => set("plantHeightCm", e.target.value)} placeholder="np. 45" />
        </div>
        <div>
          <label className={label}>Materiał doniczki</label>
          <select className={input} value={form.potMaterial} onChange={(e) => set("potMaterial", e.target.value)}>
            <option value="">—</option>
            <option value="terracotta">Terakota</option>
            <option value="plastic">Plastik</option>
            <option value="ceramic">Ceramika</option>
            <option value="fabric">Tkanina / mesh</option>
            <option value="other">Inny</option>
          </select>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label className={label}>Typ podłoża</label>
          <input className={input} value={form.substrateType} onChange={(e) => set("substrateType", e.target.value)} placeholder="np. ziemia uniwersalna, mix aroidów" />
        </div>
        <div>
          <label className={label}>Ostatnie przesadzanie</label>
          <input className={input} type="date" value={form.lastRepottedAt} onChange={(e) => set("lastRepottedAt", e.target.value)} />
        </div>
        <div>
          <label className={label}>Rodzaj wody</label>
          <select className={input} value={form.waterType} onChange={(e) => set("waterType", e.target.value)}>
            <option value="">—</option>
            <option value="tap">Kranówka</option>
            <option value="filtered">Przefiltrowana</option>
            <option value="distilled">Destylowana</option>
            <option value="rain">Deszczówka</option>
          </select>
        </div>
        <div>
          <label className={label}>Auto-plan (co ile dni)</label>
          <input
            className={input}
            type="number"
            min={1}
            value={form.carePlanDays}
            onChange={(e) => set("carePlanDays", e.target.value)}
            placeholder="np. 7 (puste = brak)"
          />
        </div>
        <div className="flex items-center gap-2 pt-6">
          <input
            type="checkbox"
            id="sensorCheck"
            checked={form.sensorCheck}
            onChange={(e) => setForm((f) => ({ ...f, sensorCheck: e.target.checked }))}
            className="h-4 w-4 rounded border-zinc-300"
          />
          <label htmlFor="sensorCheck" className="text-sm text-zinc-700 dark:text-zinc-300">
            Inteligentne przypomnienia z czujników (LLM)
          </label>
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
