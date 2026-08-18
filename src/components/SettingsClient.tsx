"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"

interface SensorMapping {
  id: number
  plantId: number
  plantName: string | null
  topic: string
  metric: string
  source: string
}

interface SettingsData {
  mqtt: { host: string; port: number; user: string; hasPassword: boolean }
  ha: { url: string; hasToken: boolean }
  llm: { provider: string; model: string; hasApiKey: boolean; baseUrl: string }
  opb: { hasClientId: boolean; hasSecret: boolean }
  connected: boolean
}

interface HaEntity {
  entity_id: string
  state: string
  unit: string | null
  friendly_name: string | null
}

export default function SettingsClient({
  initial,
}: {
  initial: { settings: SettingsData; mappings: SensorMapping[]; plants: { id: number; name: string }[] }
}) {
  const router = useRouter()
  const [cfg, setCfg] = useState(initial.settings)
  const [mappings, setMappings] = useState(initial.mappings)
  const [plants, setPlants] = useState(initial.plants)
  const [connected, setConnected] = useState(initial.settings.connected)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [pw, setPw] = useState("")
  const [haToken, setHaToken] = useState("")
  const [apiKey, setApiKey] = useState("")
  const [opbClientId, setOpbClientId] = useState("")
  const [opbSecret, setOpbSecret] = useState("")
  const [newMapping, setNewMapping] = useState({ plantId: "", topic: "", metric: "moisture" })
  const [testResult, setTestResult] = useState<{ type: string; ok: boolean; message: string; details?: string } | null>(null)
  const [testing, setTesting] = useState<string | null>(null)
  const [haEntities, setHaEntities] = useState<HaEntity[]>([])
  const [pickerLoading, setPickerLoading] = useState(false)
  const [pickerError, setPickerError] = useState<string | null>(null)
  const [showPicker, setShowPicker] = useState(false)
  const [pickerSearch, setPickerSearch] = useState("")

  async function testConnection(type: string) {
    setTesting(type)
    setTestResult(null)
    try {
      const payload: Record<string, unknown> = { type }
      if (type === "mqtt") {
        payload.mqtt = { host: cfg.mqtt.host, port: cfg.mqtt.port, user: cfg.mqtt.user, password: pw || undefined }
      }
      if (type === "ha") {
        payload.ha = { url: cfg.ha.url, token: haToken || undefined }
      }
      const res = await fetch("/api/settings/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      setTestResult({ type, ok: data.ok, message: data.message, details: data.details })
    } catch {
      setTestResult({ type, ok: false, message: "Błąd połączenia z serwerem" })
    } finally {
      setTesting(null)
    }
  }

  async function load() {
    const [settings, sens, pl] = await Promise.all([
      fetch("/api/settings").then((r) => r.json()),
      fetch("/api/sensors").then((r) => r.json()),
      fetch("/api/plants").then((r) => r.json()),
    ])
    setCfg(settings)
    setConnected(settings.connected)
    setMappings(sens)
    setPlants(pl)
  }

  useEffect(() => {
    const t = setInterval(() => fetch("/api/status").then((r) => r.json()).then((d) => setConnected(d.connected)).catch(() => {}), 5000)
    return () => clearInterval(t)
  }, [])

  const input = "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
  const label = "mb-1 block text-sm font-medium text-zinc-600 dark:text-zinc-400"

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setSaved(false)
    try {
      const body: Record<string, unknown> = {
        mqtt: {
          host: cfg.mqtt.host,
          port: cfg.mqtt.port,
          user: cfg.mqtt.user,
        },
        ha: {
          url: cfg.ha.url,
        },
        llm: {
          provider: cfg.llm.provider,
          model: cfg.llm.model,
          baseUrl: cfg.llm.baseUrl,
        },
        opb: {},
      }
      if (pw) body.mqtt = { ...(body.mqtt as object), password: pw }
      if (haToken) body.ha = { ...(body.ha as object), token: haToken }
      if (apiKey) body.llm = { ...(body.llm as object), apiKey }
      if (opbClientId) body.opb = { ...(body.opb as object), clientId: opbClientId }
      if (opbSecret) body.opb = { ...(body.opb as object), secret: opbSecret }
      await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      setPw("")
      setHaToken("")
      setApiKey("")
      setOpbClientId("")
      setOpbSecret("")
      setSaved(true)
      await load()
    } finally {
      setSaving(false)
    }
  }

  async function addMapping() {
    if (!newMapping.plantId || !newMapping.topic.trim()) return
    await fetch("/api/sensors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plantId: Number(newMapping.plantId), topic: newMapping.topic, metric: newMapping.metric, source: "ha" }),
    })
    setNewMapping({ plantId: "", topic: "", metric: "moisture" })
    await load()
    router.refresh()
  }

  async function delMapping(id: number) {
    await fetch(`/api/sensors?id=${id}`, { method: "DELETE" })
    await load()
  }

  async function fetchHaEntities() {
    setPickerLoading(true)
    setPickerError(null)
    try {
      const res = await fetch("/api/ha/entities?domain=sensor")
      if (!res.ok) {
        const data = await res.json()
        setPickerError(data.error ?? `Błąd ${res.status}`)
        return
      }
      setHaEntities(await res.json())
      setShowPicker(true)
    } catch {
      setPickerError("Nie udało się pobrać encji z HA")
    } finally {
      setPickerLoading(false)
    }
  }

  function selectEntity(id: string) {
    setNewMapping((m) => ({ ...m, topic: id }))
    setShowPicker(false)
    setPickerSearch("")
  }

  const filteredHa = haEntities.filter(
    (e) =>
      pickerSearch === "" ||
      e.entity_id.toLowerCase().includes(pickerSearch.toLowerCase()) ||
      (e.friendly_name && e.friendly_name.toLowerCase().includes(pickerSearch.toLowerCase()))
  )

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">Ustawienia</h1>

      <section className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">Home Assistant</h2>
          <button type="button" onClick={() => testConnection("ha")} disabled={testing === "ha"} className="rounded-lg border border-zinc-300 px-3 py-1 text-xs font-medium hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-600 dark:hover:bg-zinc-800">
            {testing === "ha" ? "Testowanie..." : "Testuj połączenie"}
          </button>
        </div>
        <form onSubmit={save} className="space-y-4">
          <div>
            <label className={label}>URL (np. http://homeassistant.local:8123)</label>
            <input className={input} value={cfg.ha.url} onChange={(e) => setCfg((c) => ({ ...c, ha: { ...c.ha, url: e.target.value } }))} placeholder="http://homeassistant.local:8123" />
          </div>
          <div>
            <label className={label}>Long-Lived Access Token {cfg.ha.hasToken && "(zapisany)"}</label>
            <input className={input} type="password" value={haToken} onChange={(e) => setHaToken(e.target.value)} placeholder="eyJ..." />
          </div>
        </form>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">MQTT (publikacja roślin do HA)</h2>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => testConnection("mqtt")} disabled={testing === "mqtt"} className="rounded-lg border border-zinc-300 px-3 py-1 text-xs font-medium hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-600 dark:hover:bg-zinc-800">
              {testing === "mqtt" ? "Testowanie..." : "Testuj"}
            </button>
            <span className={`rounded-full px-2 py-0.5 text-xs ${connected ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
              {connected ? "Połączono" : "Rozłączono"}
            </span>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={label}>Host</label>
            <input className={input} value={cfg.mqtt.host} onChange={(e) => setCfg((c) => ({ ...c, mqtt: { ...c.mqtt, host: e.target.value } }))} placeholder="core-mosquitto" />
          </div>
          <div>
            <label className={label}>Port</label>
            <input className={input} type="number" value={cfg.mqtt.port} onChange={(e) => setCfg((c) => ({ ...c, mqtt: { ...c.mqtt, port: Number(e.target.value) } }))} />
          </div>
          <div>
            <label className={label}>Użytkownik</label>
            <input className={input} value={cfg.mqtt.user} onChange={(e) => setCfg((c) => ({ ...c, mqtt: { ...c.mqtt, user: e.target.value } }))} />
          </div>
          <div>
            <label className={label}>Hasło {cfg.mqtt.hasPassword && "(zapisane)"}</label>
            <input className={input} type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="••••••••" />
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="mb-3 font-semibold">LLM / OpenPlantBook</h2>
        <div className="space-y-4">
          <div>
            <label className={label}>LLM provider</label>
            <select
              className={input}
              value={cfg.llm.provider}
              onChange={(e) => setCfg((c) => ({ ...c, llm: { ...c.llm, provider: e.target.value } }))}
            >
              <option value="ollama">Ollama (lokalnie)</option>
              <option value="openai">OpenAI</option>
              <option value="anthropic">Anthropic</option>
              <option value="litellm">LiteLLM (proxy)</option>
            </select>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={label}>Model</label>
              <input className={input} value={cfg.llm.model} onChange={(e) => setCfg((c) => ({ ...c, llm: { ...c.llm, model: e.target.value } }))} placeholder="gpt-4o-mini / llava / model-name" />
            </div>
            <div>
              <label className={label}>Base URL (dla Ollama / LiteLLM)</label>
              <input className={input} value={cfg.llm.baseUrl} onChange={(e) => setCfg((c) => ({ ...c, llm: { ...c.llm, baseUrl: e.target.value } }))} placeholder="http://localhost:11434/v1 / http://localhost:4000" />
            </div>
          </div>
          <div>
            <label className={label}>Klucz API {cfg.llm.hasApiKey && "(zapisany)"}</label>
            <div className="flex gap-2">
              <input className={input + " flex-1"} type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="••••••••" />
              <button type="button" onClick={() => testConnection("llm")} disabled={testing === "llm"} className="shrink-0 rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-600 dark:hover:bg-zinc-800">
                {testing === "llm" ? "Testowanie..." : "Testuj LLM"}
              </button>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={label}>OpenPlantBook client_id {cfg.opb.hasClientId && "✓"}</label>
              <input className={input} value={opbClientId} onChange={(e) => setOpbClientId(e.target.value)} />
            </div>
            <div>
              <label className={label}>OpenPlantBook secret {cfg.opb.hasSecret && "✓"}</label>
              <div className="flex gap-2">
                <input className={input + " flex-1"} type="password" value={opbSecret} onChange={(e) => setOpbSecret(e.target.value)} placeholder="••••••••" />
                <button type="button" onClick={() => testConnection("opb")} disabled={testing === "opb"} className="shrink-0 rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-600 dark:hover:bg-zinc-800">
                  {testing === "opb" ? "Testowanie..." : "Testuj OPB"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {testResult && (
        <div className={`rounded-lg px-3 py-2 text-sm ${testResult.ok ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" : "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400"}`}>
          <span className="font-medium">{testResult.ok ? "OK" : "Błąd"}:</span> {testResult.message}
          {testResult.details && <span className="ml-1 text-xs opacity-70">({testResult.details})</span>}
        </div>
      )}

      <div className="flex items-center gap-3">
        <button type="button" onClick={save} disabled={saving} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
          {saving ? "Zapisywanie..." : "Zapisz"}
        </button>
        {saved && <span className="text-sm text-emerald-600">Zapisano</span>}
      </div>

      <section className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="mb-3 font-semibold">Mapowanie czujników z HA</h2>
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-40 flex-1">
            <label className={label}>Roślina</label>
            <select className={input} value={newMapping.plantId} onChange={(e) => setNewMapping((m) => ({ ...m, plantId: e.target.value }))}>
              <option value="">— wybierz —</option>
              {plants.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div className="min-w-56 flex-1">
            <label className={label}>Entity ID</label>
            <div className="flex gap-2">
              <input className={input + " flex-1"} placeholder="sensor.wilgotnosc" value={newMapping.topic} onChange={(e) => setNewMapping((m) => ({ ...m, topic: e.target.value }))} />
              <button type="button" onClick={fetchHaEntities} disabled={pickerLoading} className="shrink-0 rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-600 dark:hover:bg-zinc-800">
                {pickerLoading ? "Szukam..." : "Przeglądaj HA"}
              </button>
            </div>
          </div>
          <div>
            <label className={label}>Metryka</label>
            <select className={input} value={newMapping.metric} onChange={(e) => setNewMapping((m) => ({ ...m, metric: e.target.value }))}>
              <option value="moisture">Wilgotność</option>
              <option value="temperature">Temperatura</option>
            </select>
          </div>
          <button onClick={addMapping} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700">
            Dodaj
          </button>
        </div>

        {showPicker && (
          <div className="mt-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-800">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-medium">Czujniki HA ({filteredHa.length})</h3>
              <button type="button" onClick={() => { setShowPicker(false); setPickerSearch("") }} className="text-xs text-zinc-500 hover:underline">zamknij</button>
            </div>
            <input className={input + " mb-2"} placeholder="Szukaj czujnika..." value={pickerSearch} onChange={(e) => setPickerSearch(e.target.value)} autoFocus />
            {pickerError && <p className="mb-2 text-sm text-red-600">{pickerError}</p>}
            <div className="max-h-64 space-y-1 overflow-y-auto">
              {filteredHa.map((e) => (
                <button key={e.entity_id} type="button" onClick={() => selectEntity(e.entity_id)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-white dark:hover:bg-zinc-700">
                  <span className="flex-1 truncate font-mono text-xs">{e.entity_id}</span>
                  <span className="shrink-0 rounded bg-zinc-200 px-1.5 py-0.5 text-xs text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300">{e.state}{e.unit ? ` ${e.unit}` : ""}</span>
                  {e.friendly_name && <span className="shrink-0 text-xs text-zinc-400">{e.friendly_name}</span>}
                </button>
              ))}
              {filteredHa.length === 0 && <p className="text-sm text-zinc-400">Brak wyników.</p>}
            </div>
          </div>
        )}

        <ul className="mt-3 space-y-1">
          {mappings.map((m) => (
            <li key={m.id} className="flex items-center justify-between rounded-lg bg-zinc-50 px-3 py-2 text-sm dark:bg-zinc-800">
              <span className="flex items-center gap-2">
                <strong>{m.plantName ?? `#${m.plantId}`}</strong>
                <span className="text-zinc-400">·</span>
                {m.metric}
                <span className="text-zinc-400">·</span>
                <code className="text-zinc-500">{m.topic}</code>
              </span>
              <button onClick={() => delMapping(m.id)} className="text-xs text-red-500 hover:underline">
                usuń
              </button>
            </li>
          ))}
          {mappings.length === 0 && <li className="text-sm text-zinc-400">Brak mapowań.</li>}
        </ul>
      </section>
    </div>
  )
}
