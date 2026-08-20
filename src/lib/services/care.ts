import { desc, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { careLogs, timelineEntries } from '@/lib/db/schema'
import { CARE_META, isCareType, type CareType } from '@/lib/care-types'

export async function logCare(plantId: number, kind: CareType, amount?: number, unit?: string, notes?: string) {
  const now = Math.floor(Date.now() / 1000)
  db.insert(careLogs)
    .values({ plantId, kind, amount: amount ?? null, unit: unit ?? null, notes: notes ?? null, createdAt: now })
    .run()
  const meta = CARE_META[kind]
  db.insert(timelineEntries)
    .values({
      plantId,
      kind: 'event',
      title: meta.label,
      content: notes ?? null,
      dataJson: JSON.stringify({ kind, amount, unit }),
      createdAt: now,
    })
    .run()
}

export function normalizeCareKind(k: string): CareType | null {
  return isCareType(k) ? k : null
}

export async function addTimelineEntry(plantId: number, input: { kind?: string; title?: string; content?: string; photoId?: number; dataJson?: string }) {
  return db
    .insert(timelineEntries)
    .values({
      plantId,
      kind: input.kind ?? 'note',
      title: input.title ?? null,
      content: input.content ?? null,
      photoId: input.photoId ?? null,
      dataJson: input.dataJson ?? null,
    })
    .run()
}

export async function deleteTimelineEntry(id: number) {
  const entry = db.select().from(timelineEntries).where(eq(timelineEntries.id, id)).get()
  db.delete(timelineEntries).where(eq(timelineEntries.id, id)).run()
  if (entry?.kind === 'event' && entry.dataJson) {
    try {
      const data = JSON.parse(entry.dataJson)
      if (data.kind) {
        const log = db.select().from(careLogs)
          .where(eq(careLogs.plantId, entry.plantId))
          .all()
          .find((l) => l.kind === data.kind && Math.abs(l.createdAt - entry.createdAt) < 5)
        if (log) db.delete(careLogs).where(eq(careLogs.id, log.id)).run()
      }
    } catch {}
  }
}

export async function updateTimelineEntryCreatedAt(id: number, createdAt: number) {
  db.update(timelineEntries).set({ createdAt }).where(eq(timelineEntries.id, id)).run()
}

export async function listCareLogs(plantId: number) {
  return db
    .select()
    .from(careLogs)
    .where(eq(careLogs.plantId, plantId))
    .orderBy(desc(careLogs.createdAt))
    .all()
}
