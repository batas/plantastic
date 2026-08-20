"use client"

import { useState } from "react"
import { formatDate } from "@/lib/format"
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts"

type Reading = { value: number; unit: string | null; measuredAt: number }

const METRICS: { key: string; label: string; color: string; unit: string }[] = [
  { key: "moisture", label: "Wilgotność gleby", color: "#38bdf8", unit: "%" },
  { key: "temperature", label: "Temperatura", color: "#f97316", unit: "°C" },
  { key: "air_humidity", label: "Wilgotność powietrza", color: "#22d3ee", unit: "%" },
  { key: "light", label: "Światło", color: "#facc15", unit: "lx" },
]

export default function SensorCharts({
  latestReadings,
}: {
  latestReadings: Record<string, Reading[]>
}) {
  const [range, setRange] = useState<24 | 72 | 168 | 720>(24)

  const cutoff = Math.floor(Date.now() / 1000) - range * 3600

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <h2 className="font-semibold">Wykresy</h2>
        <select
          value={range}
          onChange={(e) => setRange(Number(e.target.value) as 24 | 72 | 168 | 720)}
          className="rounded-lg border border-zinc-300 bg-white px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-800"
        >
          <option value={24}>24h</option>
          <option value={72}>3 dni</option>
          <option value={168}>7 dni</option>
          <option value={720}>30 dni</option>
        </select>
      </div>
      {METRICS.map((m) => {
        const raw = latestReadings[m.key]
        if (!raw || raw.length === 0) return null
        const data = raw
          .filter((r) => r.measuredAt >= cutoff)
          .map((r) => ({
            time: r.measuredAt * 1000,
            value: r.value,
            label: formatDate(r.measuredAt),
          }))
          .reverse()
        if (data.length < 2) return null
        return (
          <div key={m.key} className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
            <div className="mb-2 text-sm font-medium">{m.label}</div>
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={data} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" opacity={0.3} />
                <XAxis
                  dataKey="time"
                  type="number"
                  domain={["dataMin", "dataMax"]}
                  tickFormatter={(ts) => {
                    const d = new Date(Number(ts))
                    return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`
                  }}
                  tick={{ fontSize: 10, fill: "#a1a1aa" }}
                  stroke="#27272a"
                />
                <YAxis tick={{ fontSize: 10, fill: "#a1a1aa" }} stroke="#27272a" />
                <Tooltip
                  labelFormatter={(ts) => formatDate(Math.floor(Number(ts) / 1000))}
                  formatter={(val) => [`${val}${m.unit}`, m.label]}
                  contentStyle={{ background: "#18181b", border: "1px solid #27272a", borderRadius: 8, fontSize: 12, color: "#e4e4e7" }}
                />
                <Line type="monotone" dataKey="value" stroke={m.color} strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )
      })}
      {METRICS.every((m) => !latestReadings[m.key]?.length) && (
        <p className="text-sm text-zinc-400">Brak danych z czujników.</p>
      )}
    </div>
  )
}
