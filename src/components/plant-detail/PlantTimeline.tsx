"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Markdown from "react-markdown"
import { formatDate, photoUrl } from "@/lib/format"
import { CARE_META, type CareType } from "@/lib/care-types"
import { KIND_LABEL, MARKDOWN_PROSE, type Detail } from "./shared"

export default function PlantTimeline({
  plantId,
  entries,
  photos,
}: {
  plantId: number
  entries: Detail["timeline"]
  photos: Detail["photos"]
}) {
  const router = useRouter()
  const [showAddNote, setShowAddNote] = useState(false)
  const [noteText, setNoteText] = useState("")
  const [editingEntry, setEditingEntry] = useState<number | null>(null)
  const [editDate, setEditDate] = useState("")
  const [expandedEntries, setExpandedEntries] = useState<Set<number>>(new Set())

  async function addNote() {
    if (!noteText.trim()) return
    await fetch(`/api/plants/${plantId}/timeline`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "note", title: "Notatka", content: noteText }),
    })
    setNoteText("")
    setShowAddNote(false)
    router.refresh()
  }

  async function deleteEntry(entryId: number) {
    if (!confirm("Usunąć ten wpis z historii?")) return
    await fetch(`/api/plants/${plantId}/timeline?id=${entryId}`, { method: "DELETE" })
    router.refresh()
  }

  async function saveEditTime(entryId: number) {
    if (!editDate) return
    const ts = Math.floor(new Date(editDate).getTime() / 1000)
    await fetch(`/api/plants/${plantId}/timeline`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: entryId, createdAt: ts }),
    })
    setEditingEntry(null)
    router.refresh()
  }

  function toggleExpanded(id: number) {
    setExpandedEntries((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <section className="mt-6 rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold">Historia</h2>
        <button onClick={() => setShowAddNote((v) => !v)} className="text-sm text-emerald-600 hover:underline">
          + Notatka
        </button>
      </div>
      {showAddNote && (
        <div className="mb-3 flex gap-2">
          <textarea className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800" rows={2} placeholder="Notatka..." value={noteText} onChange={(e) => setNoteText(e.target.value)} />
          <button onClick={addNote} className="shrink-0 rounded-lg bg-emerald-600 px-3 text-sm font-medium text-white hover:bg-emerald-700">
            Dodaj
          </button>
        </div>
      )}
      <div className="space-y-3">
        {entries.map((entry) => {
          let careLabel = ""
          if (entry.kind === "event" && entry.dataJson) {
            try {
              const d = JSON.parse(entry.dataJson)
              if (d.kind && CARE_META[d.kind as CareType]) {
                const m = CARE_META[d.kind as CareType]
                careLabel = `${m.icon} ${m.label}`
              }
            } catch {}
          }
          const displayLabel = careLabel || (KIND_LABEL[entry.kind] ?? entry.title ?? "Wpis")
          const isEditing = editingEntry === entry.id
          const isPlan = entry.kind === "care_plan" && entry.content
          const isExpanded = expandedEntries.has(entry.id)
          let isMarkdown = false
          try { isMarkdown = !!(entry.dataJson && JSON.parse(entry.dataJson).format === "markdown") } catch {}
          let planSummary = ""
          if (isPlan && !isExpanded) {
            const lines = entry.content!.split("\n").filter((l) => l.trim())
            const firstHeading = entry.content!.match(/^#\s+(.+)/m)
            planSummary = firstHeading ? firstHeading[1] : lines[0]?.slice(0, 120) ?? ""
          }
          return (
            <div key={entry.id} className="group rounded-lg border border-zinc-100 p-3 dark:border-zinc-800">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">
                  {displayLabel}
                  {entry.title && entry.kind !== "event" && entry.kind !== "note" && <span className="text-zinc-400"> — {entry.title}</span>}
                </span>
                <div className="flex items-center gap-2">
                  {isEditing ? (
                    <span className="flex items-center gap-1">
                      <input type="datetime-local" value={editDate} onChange={(e) => setEditDate(e.target.value)} className="rounded border border-zinc-300 px-1 py-0.5 text-xs dark:border-zinc-600 dark:bg-zinc-800" />
                      <button onClick={() => saveEditTime(entry.id)} className="text-xs text-emerald-600 hover:underline">OK</button>
                      <button onClick={() => setEditingEntry(null)} className="text-xs text-zinc-400 hover:underline">Anuluj</button>
                    </span>
                  ) : (
                    <span className="text-xs text-zinc-400">{formatDate(entry.createdAt)}</span>
                  )}
                  {isPlan && (
                    <button
                      onClick={() => toggleExpanded(entry.id)}
                      className="text-xs text-zinc-400 opacity-0 transition-opacity hover:text-zinc-600 group-hover:opacity-100 dark:hover:text-zinc-300"
                      title={isExpanded ? "Zwiń" : "Rozwiń"}
                    >{isExpanded ? "▲" : "▼"}</button>
                  )}
                  <button
                    onClick={() => { setEditingEntry(entry.id); setEditDate(new Date(entry.createdAt * 1000).toISOString().slice(0, 16)) }}
                    className="text-xs text-zinc-400 opacity-0 transition-opacity hover:text-zinc-600 group-hover:opacity-100 dark:hover:text-zinc-300"
                    title="Edytuj czas"
                  >✏️</button>
                  <button
                    onClick={() => deleteEntry(entry.id)}
                    className="text-xs text-zinc-400 opacity-0 transition-opacity hover:text-red-500 group-hover:opacity-100"
                    title="Usuń wpis"
                  >🗑️</button>
                </div>
              </div>
              {entry.content && (
                isPlan ? (
                  isExpanded ? (
                    <div className={`mt-2 space-y-2 text-sm text-zinc-600 dark:text-zinc-300 ${MARKDOWN_PROSE}`}>
                      <Markdown>{entry.content}</Markdown>
                    </div>
                  ) : (
                    <button
                      onClick={() => setExpandedEntries((prev) => { const next = new Set(prev); next.add(entry.id); return next })}
                      className="mt-1 w-full text-left text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                    >
                      <span className="line-clamp-2">{planSummary}</span>
                      <span className="mt-0.5 text-xs text-zinc-400">Kliknij, żeby rozwinąć...</span>
                    </button>
                  )
                ) : isMarkdown ? (
                  <div className={`mt-1 space-y-2 text-sm text-zinc-600 dark:text-zinc-300 ${MARKDOWN_PROSE}`}>
                    <Markdown>{entry.content}</Markdown>
                  </div>
                ) : (
                  <div className="mt-1 whitespace-pre-wrap text-sm text-zinc-600 dark:text-zinc-300">{entry.content}</div>
                )
              )}
              {entry.photoId && <PhotoThumb photoId={entry.photoId} photos={photos} />}
            </div>
          )
        })}
        {entries.length === 0 && <p className="text-sm text-zinc-400">Brak wpisów. Zaloguj podlewanie lub dodaj zdjęcie, żeby rozpocząć historię.</p>}
      </div>
    </section>
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
