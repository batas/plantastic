"use client"

import { useEffect, useRef, useState } from "react"
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

interface HaDeviceSensor {
  entity_id: string
  device_class: string | null
  state: string
  unit: string | null
  friendly_name: string | null
}

interface HaDevice {
  device: { id: string; name: string | null; manufacturer: string | null; model: string | null }
  sensors: HaDeviceSensor[]
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
  const [mappingMode, setMappingMode] = useState<"device" | "entity">("device")
  const [haEntities, setHaEntities] = useState<HaEntity[]>([])
  const [haDevices, setHaDevices] = useState<HaDevice[]>([])
  const [pickerLoading, setPickerLoading] = useState(false)
  const [pickerError, setPickerError] = useState<string | null>(null)
  const [pickerSearch, setPickerSearch] = useState("")
  const [showDropdown, setShowDropdown] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

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
        mqtt: { host: cfg.mqtt.host, port: cfg.mqtt.port, user: cfg.mqtt.user },
        ha: { url: cfg.ha.url },
        llm: { provider: cfg.llm.provider, model: cfg.llm.model, baseUrl: cfg.llm.baseUrl },
        opb: {},
      }
      if (pw) body.mqtt = { ...(body.mqtt as object), password: pw }
      if (haToken) body.ha = { ...(body.ha as object), token: haToken }
      if (apiKey) body.llm = { ...(body.llm as object), apiKey }
      if (opbClientId) body.opb = { ...(body.opb as object), clientId: opbClientId }
      if (opbSecret) body.opb = { ...(body.opb as object), secret: opbSecret }
      await fetch("/api/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      setPw(""); setHaToken(""); setApiKey(""); setOpbClientId(""); setOpbSecret("")
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
      body: JSON.stringify({ plantId: Number(newMapping.plantId), topic: newMapping.topic, metric: newMapping.metric }),
    })
    setNewMapping({ plantId: "", topic: "", metric: "moisture" })
    setPickerSearch("")
    setShowDropdown(false)
    await load()
    router.refresh()
  }

  async function addDeviceMappings(device: HaDevice) {
    if (!newMapping.plantId) return
    const metricMap: { [key: string]: string } = { humidity: "moisture", temperature: "temperature" }
    const payload = device.sensors
      .filter((s) => s.device_class && metricMap[s.device_class])
      .map((s) => ({ topic: s.entity_id, metric: metricMap[s.device_class!] }))
    if (payload.length === 0) return
    await fetch("/api/sensors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plantId: Number(newMapping.plantId), mappings: payload }),
    })
    setShowDropdown(false)
    setPickerSearch("")
    await load()
    router.refresh()
  }

  async function delMapping(id: number) {
    await fetch(`/api/sensors?id=${id}`, { method: "DELETE" })
    await load()
  }

  async function ensureHaEntities() {
    if (haEntities.length > 0) return
    setPickerLoading(true)
    setPickerError(null)
    try {
      const res = await fetch("/api/ha/entities?domain=sensor")
      const data = await res.json()
      if (!res.ok) { setPickerError(data.details ?? data.error ?? `Błąd ${res.status}`); return }
      setHaEntities(Array.isArray(data) ? data : [])
    } catch (err) {
      setPickerError(`Nie udało się pobrać encji: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setPickerLoading(false)
    }
  }

  async function ensureHaDevices() {
    if (haDevices.length > 0) return
    setPickerLoading(true)
    setPickerError(null)
    try {
      const res = await fetch("/api/ha/devices")
      const data = await res.json()
      if (!res.ok) { setPickerError(data.details ?? data.error ?? `Błąd ${res.status}`); return }
      setHaDevices(Array.isArray(data) ? data : [])
    } catch (err) {
      setPickerError(`Nie udało się pobrać urządzeń: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setPickerLoading(false)
    }
  }

  function selectEntity(id: string) {
    setNewMapping((m) => ({ ...m, topic: id }))
    setPickerSearch("")
    setShowDropdown(false)
  }

  const filteredHa = haEntities.filter(
    (e) => pickerSearch === "" || e.entity_id.toLowerCase().includes(pickerSearch.toLowerCase()) || (e.friendly_name && e.friendly_name.toLowerCase().includes(pickerSearch.toLowerCase()))
  )
  const filteredDevices = haDevices.filter(
    (d) => pickerSearch === "" || (d.device.name && d.device.name.toLowerCase().includes(pickerSearch.toLowerCase())) || (d.device.manufacturer && d.device.manufacturer.toLowerCase().includes(pickerSearch.toLowerCase()))
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
            <select className={input} value={cfg.llm.provider} onChange={(e) => setCfg((c) => ({ ...c, llm: { ...c.llm, provider: e.target.value } }))}>
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

        <div className="mb-4 flex gap-1 rounded-lg border border-zinc-200 bg-zinc-100 p-1 dark:border-zinc-700 dark:bg-zinc-800">
          <button type="button" onClick={() => { setMappingMode("device"); setShowDropdown(false); setPickerSearch("") }} className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition ${mappingMode === "device" ? "bg-white text-zinc-900 shadow dark:bg-zinc-700 dark:text-white" : "text-zinc-500 hover:text-zinc-700 dark:text-zinc-400"}`}>
            Po urządzeniu
          </button>
          <button type="button" onClick={() => { setMappingMode("entity"); setShowDropdown(false); setPickerSearch("") }} className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition ${mappingMode === "entity" ? "bg-white text-zinc-900 shadow dark:bg-zinc-700 dark:text-white" : "text-zinc-500 hover:text-zinc-700 dark:text-zinc-400"}`}>
            Pojedynczy czujnik
          </button>
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-40 flex-1">
            <label className={label}>Roślina</label>
            <select className={input} value={newMapping.plantId} onChange={(e) => setNewMapping((m) => ({ ...m, plantId: e.target.value }))}>
              <option value="">— wybierz —</option>
              {plants.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
        </div>

        {mappingMode === "entity" && (
          <div className="relative mt-3" ref={dropdownRef}>
            <label className={label}>Szukaj czujnika HA</label>
            <input
              className={input}
              placeholder="Wpisz nazwę entity, np. sensor.wilgotnosc..."
              value={pickerSearch}
              onChange={(e) => { setPickerSearch(e.target.value); setShowDropdown(true) }}
              onFocus={async () => { await ensureHaEntities(); setShowDropdown(true) }}
              ref={searchInputRef}
            />
            {pickerLoading && <p className="mt-1 text-xs text-zinc-400">Ładowanie encji z HA...</p>}
            {pickerError && <p className="mt-1 text-xs text-red-600">{pickerError}</p>}
            {showDropdown && !pickerLoading && haEntities.length > 0 && (
              <div className="absolute z-10 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border border-zinc-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
                {filteredHa.length === 0 && <p className="px-3 py-2 text-sm text-zinc-400">Brak wyników dla &quot;{pickerSearch}&quot;</p>}
                {filteredHa.slice(0, 50).map((e) => (
                  <button key={e.entity_id} type="button" onClick={() => selectEntity(e.entity_id)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800">
                    <span className="flex-1 truncate font-mono text-xs">{e.entity_id}</span>
                    <span className="shrink-0 rounded bg-zinc-200 px-1.5 py-0.5 text-xs text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300">{e.state}{e.unit ? ` ${e.unit}` : ""}</span>
                    {e.friendly_name && <span className="shrink-0 max-w-[120px] truncate text-xs text-zinc-400">{e.friendly_name}</span>}
                  </button>
                ))}
                {filteredHa.length > 50 && <p className="px-3 py-1 text-xs text-zinc-400">...i {filteredHa.length - 50} więcej</p>}
              </div>
            )}
            {newMapping.topic && (
              <p className="mt-1 text-xs text-zinc-500">Wybrano: <code className="font-mono">{newMapping.topic}</code></p>
            )}
          </div>
        )}

        {mappingMode === "entity" && newMapping.topic && (
          <div className="mt-3 flex items-end gap-2">
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
        )}

        {mappingMode === "device" && (
          <div className="relative mt-3" ref={dropdownRef}>
            <label className={label}>Szukaj urządzenia HA</label>
            <input
              className={input}
              placeholder="Wpisz nazwę producenta lub urządzenia..."
              value={pickerSearch}
              onChange={(e) => { setPickerSearch(e.target.value); setShowDropdown(true) }}
              onFocus={async () => { await ensureHaDevices(); setShowDropdown(true) }}
              ref={searchInputRef}
            />
            {pickerLoading && <p className="mt-1 text-xs text-zinc-400">Ładowanie urządzeń z HA...</p>}
            {pickerError && <p className="mt-1 text-xs text-red-600">{pickerError}</p>}
            {showDropdown && !pickerLoading && haDevices.length > 0 && (
              <div className="absolute z-10 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border border-zinc-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
                {filteredDevices.length === 0 && <p className="px-3 py-2 text-sm text-zinc-400">Brak wyników dla &quot;{pickerSearch}&quot;</p>}
                {filteredDevices.map((d) => (
                  <button key={d.device.id} type="button" onClick={() => addDeviceMappings(d)} className="flex w-full flex-col gap-1 px-3 py-2 text-left text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{d.device.name ?? d.device.model ?? d.device.id}</span>
                      <span className="text-xs text-zinc-400">{d.sensors.length} czujników</span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {d.sensors.map((s) => (
                        <span key={s.entity_id} className="rounded bg-zinc-200 px-1.5 py-0.5 text-xs text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300">
                          {s.device_class ?? s.entity_id.split(".").pop()} {s.state}{s.unit ? ` ${s.unit}` : ""}
                        </span>
                      ))}
                    </div>
                    {d.device.manufacturer && <span className="text-xs text-zinc-400">{d.device.manufacturer}{d.device.model ? ` · ${d.device.model}` : ""}</span>}
                  </button>
                ))}
              </div>
            )}
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
