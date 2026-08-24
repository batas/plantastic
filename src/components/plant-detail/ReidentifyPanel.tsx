"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

type ReidentifyResult = {
  identification: { scientificName: string | null; commonName: string | null; confidence: number | null }
  opb: { pid: string; display_pid: string; scientific_name?: string; common_name?: string; alias?: string | null }[]
}

export default function ReidentifyPanel({ plantId }: { plantId: number }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [result, setResult] = useState<ReidentifyResult | null>(null)

  async function reidentify(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
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
      e.target.value = ""
    }
  }

  async function apply(commonName: string | null, scientificName: string | null, opbId?: string) {
    const payload: Record<string, unknown> = {}
    if (commonName) payload.species = commonName
    if (scientificName) payload.scientificName = scientificName
    if (opbId) payload.opbId = opbId
    const res = await fetch(`/api/plants/${plantId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
    if (res.ok) {
      setResult(null)
      router.refresh()
    }
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-zinc-100 px-3 py-1.5 text-sm font-medium text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700">
        {busy ? "🔍 Rozpoznawanie..." : "🔍 Rozpoznaj na nowo"}
        <input type="file" accept="image/*" className="hidden" onChange={reidentify} disabled={busy} />
      </label>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {result && (
        <div className="w-full rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-800/50">
          <p className="text-sm font-medium">Wynik rozpoznawania:</p>
          <p className="mt-1 text-sm">
            {result.identification.commonName ?? result.identification.scientificName ?? "Nie rozpoznano"}
            {result.identification.scientificName && <span className="italic text-zinc-500"> ({result.identification.scientificName})</span>}
            {result.identification.confidence != null && (
              <span className="ml-2 text-xs text-zinc-400">(pewność {Math.round(result.identification.confidence * 100)}%)</span>
            )}
          </p>
          {result.opb.length > 0 && (
            <div className="mt-2 space-y-1">
              {result.opb.map((r) => (
                <button key={r.pid} onClick={() => apply(r.common_name ?? r.alias ?? null, r.scientific_name ?? r.display_pid, r.pid)} className="block w-full rounded border border-zinc-200 bg-white px-2 py-1 text-left text-xs hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800 dark:hover:bg-zinc-700">
                  {r.common_name ?? r.alias ?? r.display_pid} <span className="italic text-zinc-400">{r.scientific_name ?? r.display_pid}</span>
                </button>
              ))}
            </div>
          )}
          {!result.opb.length && result.identification.scientificName && (
            <button onClick={() => apply(result.identification.commonName, result.identification.scientificName)} className="mt-2 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700">
              Zastosuj
            </button>
          )}
          <button onClick={() => setResult(null)} className="mt-2 ml-2 text-xs text-zinc-400 hover:text-zinc-600">Anuluj</button>
        </div>
      )}
    </div>
  )
}
