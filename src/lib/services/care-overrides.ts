import { and, eq, inArray, isNull } from 'drizzle-orm'
import { db } from '@/lib/db'
import { careOverrides, type CareOverride } from '@/lib/db/schema'
import type { CareType } from '@/lib/care-types'

const now = () => Math.floor(Date.now() / 1000)

/** Replace any unresolved override for (plant, kind) with a new AI recommendation. */
export function upsertOverride(
  plantId: number,
  kind: CareType,
  dueAt: number,
  reason?: string,
  urgency: 'high' | 'medium' | 'low' = 'medium',
) {
  const ts = now()
  db.transaction(() => {
    db.update(careOverrides)
      .set({ resolvedAt: ts })
      .where(and(eq(careOverrides.plantId, plantId), eq(careOverrides.kind, kind), isNull(careOverrides.resolvedAt)))
      .run()
    db.insert(careOverrides).values({ plantId, kind, dueAt, reason: reason ?? null, urgency }).run()
  })
}

export function getUnresolvedOverrides(plantId: number): CareOverride[] {
  return db
    .select()
    .from(careOverrides)
    .where(and(eq(careOverrides.plantId, plantId), isNull(careOverrides.resolvedAt)))
    .all()
}

export function getAllUnresolvedOverrides(): CareOverride[] {
  return db.select().from(careOverrides).where(isNull(careOverrides.resolvedAt)).all()
}

export function resolveOverrides(plantId: number, kinds: string[]) {
  if (kinds.length === 0) return
  db.update(careOverrides)
    .set({ resolvedAt: now() })
    .where(and(eq(careOverrides.plantId, plantId), inArray(careOverrides.kind, kinds), isNull(careOverrides.resolvedAt)))
    .run()
}
