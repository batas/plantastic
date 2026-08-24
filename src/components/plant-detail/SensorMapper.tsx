"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

type HaSensor = { entity_id: string; device_class: string | null; state: string; unit: string | null }
type HaDevice = {
  device: { id: string; name: string | null; manufacturer: string | null; model: string | null; area_name?: string | null }
  sensors: HaSensor[]
}

export default function SensorMapper({
  plantId,
  sensorMappings,
  deviceMappings,
  entityNames,
}: {
  plantId: number
  sensorMappings: { id: number; plantId: number; topic: string; metric: string; source: string }[]
  deviceMappings: { id: number; plantId: number; haDeviceId: string; deviceName: string | null; createdAt: number }[]
  entityNames: Record<string, string>
}) {
  const router = useRouter()
  const [topic, setTopic] = useState("")
  const [metric, setMetric] = useState("moisture")
  const [haEntities, setHaEntities] = useState<{ entity_id: string; state: string; friendly_name: string | null; area: string | null }[]>([])
  const [haDevices, setHaDevices] = useState<HaDevice[]>([])
  const [expandedDevice, setExpandedDevice] = useState<string | null>(null)
  const [expandedSensorMetric, setExpandedSensorMetric] = useState<Record<string, string>>({})
  const [showManualInput, setShowManualInput] = useState(false)
  const [deviceFilter, setDeviceFilter] = useState("")
  const [areaFilter, setAreaFilter] = useState("")
  const [loadingTopics, setLoadingTopics] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")

  function flash(msg: string) {
    setSuccess(msg)
    setTimeout(() => setSuccess(""), 3000)
  }

  const filteredHaDevices = haDevices.filter((d) => {
    const matchesFilter =
      !deviceFilter ||
      d.device.name?.toLowerCase().includes(deviceFilter.toLowerCase()) ||
      d.device.manufacturer?.toLowerCase().includes(deviceFilter.toLowerCase()) ||
      d.device.id.toLowerCase().includes(deviceFilter.toLowerCase())
    const matchesArea = areaFilter === "" || d.device.area_name === areaFilter
    return matchesFilter && matchesArea
  })

  const uniqueAreas = [...new Set(haDevices.map((d) => d.device.area_name).filter((a): a is string => !!a))].sort()

  async function loadTopics() {
    setLoadingTopics(true)
    setError("")
    try {
      const [devRes, entRes] = await Promise.all([fetch("/api/ha/devices"), fetch("/api/ha/entities?domain=sensor")])
      const devData = await devRes.json()
      const entData = await entRes.json()
      if (devRes.ok) setHaDevices(Array.isArray(devData) ? devData : [])
      if (entRes.ok) setHaEntities(Array.isArray(entData) ? entData : [])
      if (!devRes.ok && !entRes.ok) setError("Nie udało się pobrać danych z HA")
    } catch {
      setError("Błąd połączenia z HA")
    } finally {
      setLoadingTopics(false)
    }
  }

  async function postMapping(entityId: string, m: string) {
    const res = await fetch("/api/sensors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plantId, topic: entityId, metric: m }),
    })
    if (res.ok) {
      flash("Dodano czujnik")
      router.refresh()
    } else {
      setError("Błąd zapisu mapowania")
    }
  }

  async function addManual() {
    if (!topic.trim()) return
    try {
      await postMapping(topic.trim(), metric)
      setTopic("")
    } catch {
      setError("Błąd połączenia")
    }
  }

  async function addDeviceMapping(device: HaDevice) {
    try {
      const res = await fetch("/api/device-mappings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plantId, haDeviceId: device.device.id, deviceName: device.device.name ?? device.device.id }),
      })
      if (res.ok) {
        flash(`Mapowano urządzenie: ${device.device.name ?? device.device.id}`)
        router.refresh()
      } else {
        const data = await res.json()
        setError(data.error ?? "Błąd zapisu")
      }
    } catch {
      setError("Błąd połączenia")
    }
  }

  return (
    <div className="mt-4 border-t border-zinc-100 pt-3 dark:border-zinc-800">
      <p className="mb-2 text-xs text-zinc-400">Mapuj czujnik HA do tej rośliny</p>
      <div className="flex flex-col gap-2">
        <button type="button" onClick={loadTopics} disabled={loadingTopics} className="rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-600 dark:hover:bg-zinc-800">
          {loadingTopics ? "Szukam urządzeń..." : "Przeglądaj urządzenia HA"}
        </button>
        {error && <p className="text-xs text-red-600">{error}</p>}
        {success && <p className="text-xs text-emerald-600">{success}</p>}
        {haDevices.length > 0 && (
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
              <DeviceRow
                key={d.device.id}
                device={d}
                expanded={expandedDevice === d.device.id}
                onToggle={() => setExpandedDevice(expandedDevice === d.device.id ? null : d.device.id)}
                onMapAll={() => addDeviceMapping(d)}
                sensorMetric={(id) => expandedSensorMetric[id] ?? "moisture"}
                setSensorMetric={(id, m) => setExpandedSensorMetric((prev) => ({ ...prev, [id]: m }))}
                isMapped={(id) => sensorMappings.some((m) => m.topic === id)}
                onMapSensor={(id, m) => postMapping(id, m)}
              />
            ))}
          </div>
        )}
        <div className="mt-1">
          <button type="button" onClick={() => setShowManualInput(!showManualInput)} className="text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300">
            {showManualInput ? "ukryj" : "Wpisz encję ręcznie..."}
          </button>
          {showManualInput && (
            <div className="mt-2 flex flex-col gap-2">
              <div className="flex gap-2">
                <input className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm flex-1 dark:border-zinc-700 dark:bg-zinc-800" placeholder="sensor.wilgotnosc" value={topic} onChange={(e) => setTopic(e.target.value)} list="sensor-topics" />
              </div>
              <datalist id="sensor-topics">
                {haEntities.map((e) => <option key={e.entity_id} value={e.entity_id}>{e.friendly_name ?? e.entity_id} ({e.state})</option>)}
              </datalist>
              <div className="flex gap-2">
                <select className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800" value={metric} onChange={(e) => setMetric(e.target.value)}>
                  <option value="moisture">Wilgotność gleby</option>
                  <option value="air_humidity">Wilgotność powietrza</option>
                  <option value="temperature">Temperatura</option>
                </select>
                <button onClick={addManual} className="shrink-0 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700">
                  Dodaj
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {sensorMappings.length > 0 && (
        <div className="mt-3 border-t border-zinc-100 pt-3 dark:border-zinc-800">
          <p className="mb-1 text-xs text-zinc-400">Zmapowane czujniki</p>
          <div className="space-y-1">
            {sensorMappings.map((m) => (
              <MappedRow
                key={m.id}
                main={<><span className="font-medium">{m.metric}</span><span className="ml-2 text-zinc-500">{entityNames[m.topic] ?? m.topic}</span>{entityNames[m.topic] && <span className="ml-1 truncate text-zinc-400">{m.topic}</span>}<span className="ml-1 rounded bg-zinc-200 px-1 py-0.5 text-[10px] text-zinc-500 dark:bg-zinc-700">{m.source}</span></>}
                onDelete={async () => { await fetch(`/api/sensors?id=${m.id}`, { method: "DELETE" }); router.refresh() }}
              />
            ))}
          </div>
        </div>
      )}
      {deviceMappings.length > 0 && (
        <div className="mt-3 border-t border-zinc-100 pt-3 dark:border-zinc-800">
          <p className="mb-1 text-xs text-zinc-400">Zmapowane urządzenia</p>
          <div className="space-y-1">
            {deviceMappings.map((d) => (
              <MappedRow
                key={d.id}
                main={<><span className="font-medium">{d.deviceName ?? d.haDeviceId}</span><span className="ml-1 truncate text-zinc-400">{d.haDeviceId}</span></>}
                onDelete={async () => { await fetch(`/api/device-mappings?id=${d.id}`, { method: "DELETE" }); router.refresh() }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function DeviceRow({
  device,
  expanded,
  onToggle,
  onMapAll,
  sensorMetric,
  setSensorMetric,
  isMapped,
  onMapSensor,
}: {
  device: HaDevice
  expanded: boolean
  onToggle: () => void
  onMapAll: () => void
  sensorMetric: (entityId: string) => string
  setSensorMetric: (entityId: string, metric: string) => void
  isMapped: (entityId: string) => boolean
  onMapSensor: (entityId: string, metric: string) => void
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-700">
      <button type="button" onClick={onToggle} className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <svg className={`h-4 w-4 shrink-0 text-zinc-400 transition-transform ${expanded ? "rotate-90" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
            <span className="font-medium truncate">{device.device.name ?? device.device.model ?? device.device.id}</span>
          </div>
          <div className="ml-6 flex items-center gap-2">
            {device.device.area_name && <span className="text-xs text-zinc-400">{device.device.area_name}</span>}
            <span className="text-xs text-zinc-400">{device.sensors.length} czujników</span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1 ml-2">
          <button type="button" onClick={(e) => { e.stopPropagation(); onMapAll() }} title="Mapuj wszystkie czujniki z urządzenia" className="rounded-md bg-emerald-600 px-2 py-1 text-xs font-medium text-white hover:bg-emerald-700">
            Mapuj wszystkie
          </button>
        </div>
      </button>
      {expanded && (
        <div className="border-t border-zinc-100 bg-zinc-50 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-800/50">
          <div className="space-y-1">
            {device.sensors.map((s) => {
              const mapped = isMapped(s.entity_id)
              return (
                <div key={s.entity_id} className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-xs ${mapped ? "bg-emerald-50 dark:bg-emerald-900/20" : "hover:bg-zinc-100 dark:hover:bg-zinc-700"}`}>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="font-medium truncate">{s.entity_id.split(".").pop()}</span>
                      {mapped && <span className="text-emerald-600 text-[10px]">✓</span>}
                    </div>
                    <div className="flex items-center gap-1 text-zinc-500">
                      <span>{s.state}{s.unit ? ` ${s.unit}` : ""}</span>
                      <span className="text-zinc-400">· {s.device_class ?? "brak klasy"}</span>
                    </div>
                  </div>
                  <select value={sensorMetric(s.entity_id)} onChange={(e) => setSensorMetric(s.entity_id, e.target.value)} className="rounded border border-zinc-300 bg-white px-1.5 py-1 text-[11px] dark:border-zinc-600 dark:bg-zinc-800">
                    <option value="moisture">gleba</option>
                    <option value="air_humidity">powietrze</option>
                    <option value="temperature">temp</option>
                  </select>
                  <button type="button" onClick={() => onMapSensor(s.entity_id, sensorMetric(s.entity_id))} disabled={mapped} className="shrink-0 rounded-md bg-emerald-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed">
                    Mapuj
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function MappedRow({ main, onDelete }: { main: React.ReactNode; onDelete: () => void }) {
  return (
    <div className="flex items-center justify-between rounded-lg bg-zinc-50 px-3 py-1.5 text-xs dark:bg-zinc-800/50">
      <div className="min-w-0 flex-1">{main}</div>
      <button type="button" onClick={onDelete} className="ml-2 shrink-0 text-zinc-400 hover:text-red-500">
        ✕
      </button>
    </div>
  )
}
