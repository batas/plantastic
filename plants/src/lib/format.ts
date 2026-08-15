export function formatDate(ts: number | null | undefined): string {
  if (!ts) return "—"
  return new Date(ts * 1000).toLocaleString("pl-PL", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })
}

export function relativeTime(ts: number | null | undefined): string {
  if (!ts) return "nigdy"
  const diff = Date.now() / 1000 - ts
  if (diff < 60) return "przed chwilą"
  if (diff < 3600) return `${Math.floor(diff / 60)} min temu`
  if (diff < 86400) return `${Math.floor(diff / 3600)} h temu`
  return `${Math.floor(diff / 86400)} dni temu`
}

export function dueLabel(dueAt: number | null, overdue: boolean): { label: string; tone: string } {
  if (!dueAt) return { label: "—", tone: "bg-zinc-100 text-zinc-500" }
  if (overdue) return { label: "do podlania!", tone: "bg-red-100 text-red-700" }
  const hours = (dueAt - Date.now() / 1000) / 3600
  if (hours < 24) return { label: "za <24h", tone: "bg-amber-100 text-amber-700" }
  return { label: "ok", tone: "bg-emerald-100 text-emerald-700" }
}

export function photoUrl(path: string | null | undefined): string | null {
  if (!path) return null
  return `/photos/${path}`
}
