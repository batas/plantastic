"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

type Identification = {
  scientificName: string | null
  commonName: string | null
  family: string | null
  confidence: number | null
  description: string
}

type OpbHit = {
  pid: string
  display_pid: string
  scientific_name?: string
  common_name?: string
  alias?: string | null
  family?: string
  watering?: string[]
  sunlight?: string[]
}

export default function IdentifyPage() {
  const router = useRouter()
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [result, setResult] = useState<{ identification: Identification; opb: OpbHit[] } | null>(null)

  function onFile(f: File | null) {
    setFile(f)
    setResult(null)
    setError("")
    if (f) {
      const reader = new FileReader()
      reader.onload = () => setPreview(reader.result as string)
      reader.readAsDataURL(f)
    } else {
      setPreview(null)
    }
  }

  async function identify() {
    if (!file) return
    setBusy(true)
    setError("")
    setResult(null)
    try {
      const form = new FormData()
      form.append("file", file)
      const res = await fetch("/api/identify", { method: "POST", body: form })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? "Błąd identyfikacji")
        return
      }
      setResult(data)
    } catch {
      setError("Błąd połączenia")
    } finally {
      setBusy(false)
    }
  }

  function goCreate(commonName: string | null, scientificName: string | null, opbId?: string) {
    const params = new URLSearchParams()
    if (commonName) params.set("species", commonName)
    if (scientificName) params.set("scientificName", scientificName)
    if (opbId) params.set("opbId", String(opbId))
    router.push(`/plants/new?${params.toString()}`)
  }

  const conf = result?.identification.confidence
  const confidenceLabel =
    conf == null
      ? ""
      : conf >= 0.75
        ? "wysoka"
        : conf >= 0.5
          ? "średnia"
          : "niska"
  const confidenceTone =
    conf == null
      ? ""
      : conf >= 0.75
        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
        : conf >= 0.5
          ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
          : "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-bold">📷 Rozpoznaj roślinę</h1>
      <p className="mt-1 text-zinc-500">Wgraj zdjęcie — AI określi gatunek i podpowie odpowiednik w OpenPlantBook.</p>

      <div className="mt-6 rounded-xl border-2 border-dashed border-zinc-300 p-6 text-center dark:border-zinc-700">
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="Podgląd" className="mx-auto max-h-72 rounded-lg object-contain" />
        ) : (
          <p className="py-10 text-4xl">🪴</p>
        )}
        <label className="mt-4 inline-block cursor-pointer rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700">
          {file ? "Zmień zdjęcie" : "Wybierz zdjęcie"}
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => onFile(e.target.files?.[0] ?? null)}
          />
        </label>
        {file && (
          <button
            onClick={identify}
            disabled={busy}
            className="ml-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50"
          >
            {busy ? "Rozpoznawanie..." : "🔍 Rozpoznaj"}
          </button>
        )}
      </div>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      {result && (
        <div className="mt-6 space-y-4">
          {result.identification.scientificName ? (
            <div className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-lg font-bold">
                  {result.identification.commonName ?? result.identification.scientificName}
                </h2>
                {conf != null && (
                  <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${confidenceTone}`}>
                    pewność {Math.round(conf * 100)}% ({confidenceLabel})
                  </span>
                )}
              </div>
              {result.identification.scientificName && (
                <p className="italic text-zinc-500">{result.identification.scientificName}</p>
              )}
              {result.identification.family && (
                <p className="text-sm text-zinc-400">Rodzina: {result.identification.family}</p>
              )}
              {result.identification.description && (
                <p className="mt-2 text-sm">{result.identification.description}</p>
              )}
              <button
                onClick={() =>
                  goCreate(result.identification.commonName, result.identification.scientificName)
                }
                className="mt-3 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
              >
                ➕ Dodaj tę roślinę
              </button>
            </div>
          ) : (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
              Nie udało się pewnie rozpoznać gatunku. Wyszukaj poniżej ręcznie albo opisz roślinę w formularzu.
            </div>
          )}

          {result.opb.length > 0 && (
            <div>
              <h3 className="mb-2 text-sm font-semibold text-zinc-500">Dopasowania z OpenPlantBook:</h3>
              <ul className="space-y-2">
                {result.opb.map((r) => (
                  <li key={r.pid}>
                    <button
                      onClick={() => goCreate(r.common_name ?? r.alias ?? null, r.scientific_name ?? r.display_pid, r.pid)}
                      className="flex w-full items-center justify-between rounded-lg border border-zinc-200 bg-white px-3 py-2 text-left text-sm hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800"
                    >
                      <span>
                        {r.common_name ?? r.alias ?? r.display_pid}
                        <span className="text-zinc-400 italic"> {r.scientific_name ?? r.display_pid}</span>
                      </span>
                      <span className="text-xs text-zinc-400">wybierz →</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
