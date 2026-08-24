import { and, desc, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { careLogs } from '@/lib/db/schema'
import { getConfig } from '@/lib/settings'
import { CARE_META, type CareType } from '@/lib/care-types'
import { getNextCareDates, listPlants } from './plants'
import { logCare } from './care'
import { callHaService, getStates } from '@/lib/ha'
import { wsCommand } from '@/lib/ha/websocket'

/** Tasks due within this horizon are pushed to the HA to-do list. */
const WINDOW_DAYS = 7
/** If a care_log was recorded moments before a HA item is checked off, don't double-log. */
const DOUBLE_LOG_GUARD_S = 300

let syncing = false

export interface TodoItem {
  uid: string
  summary: string
  status?: string
  due?: string | null
  description?: string | null
}

interface DesiredTask {
  summary: string
  description: string
  dueDate: string // YYYY-MM-DD
  plantId: number
  kind: CareType
}

const LABELS_RE = Object.values(CARE_META)
  .map((m) => m.label)
  .join('|')
const ICONS_CLASS = Object.values(CARE_META)
  .map((m) => m.icon)
  .join('')

/** Items created by us, e.g. "💧 Monstera – podlewanie". */
const OUR_ITEM_RE = new RegExp(`^[${ICONS_CLASS}]\\s.+ – (${LABELS_RE})$`)

export function todoSummary(plantName: string, kind: CareType): string {
  const meta = CARE_META[kind]
  return `${meta.icon} ${plantName} – ${meta.label}`
}

function toDateStr(tsSec: number): string {
  return new Date(tsSec * 1000).toLocaleDateString('sv-SE')
}

export async function listTodoEntities(): Promise<{ entity_id: string; friendly_name: string | null }[]> {
  const states = await getStates('todo')
  return states.map((s) => ({
    entity_id: s.entity_id,
    friendly_name: (s.attributes.friendly_name as string) ?? s.entity_id,
  }))
}

async function fetchItems(entityId: string): Promise<TodoItem[]> {
  try {
    const items = await wsCommand<TodoItem[]>('todo/item/list', { entity_id: entityId })
    return Array.isArray(items) ? items : []
  } catch (err) {
    console.error('[todo-sync] item/list failed:', err instanceof Error ? err.message : err)
    return []
  }
}

/**
 * Two-way sync between plant care schedule and the configured HA to-do list.
 * - pushes upcoming/overdue care tasks (incl. accelerated AI overrides) as items
 * - updating an item's due date when the schedule changes, removing stale items
 * - checking an item off in HA logs the care event ("Wykonane z Home Assistant")
 */
export async function syncTodoLists(): Promise<void> {
  if (syncing) return
  syncing = true
  try {
    const cfg = getConfig()
    const entityId = cfg.ha?.todoEntity
    if (!entityId || !cfg.ha?.url || !cfg.ha?.token) return

    const nowSec = Date.now() / 1000
    const windowEnd = nowSec + WINDOW_DAYS * 86400
    const desired = new Map<string, DesiredTask>()

    for (const plant of await listPlants()) {
      const statuses = await getNextCareDates(plant.id).catch(() => null)
      if (!statuses) continue
      for (const s of statuses) {
        if (!s.dueAt || s.dueAt > windowEnd) continue
        desired.set(todoSummary(plant.name, s.type), {
          summary: todoSummary(plant.name, s.type),
          description: s.aiReason ?? '',
          dueDate: toDateStr(s.dueAt),
          plantId: plant.id,
          kind: s.type,
        })
      }
    }

    const items = await fetchItems(entityId)
    const presentSummaries = new Set<string>()
    let changed = false

    for (const item of items) {
      const task = desired.get(item.summary)
      if (task) {
        presentSummaries.add(item.summary)
        if (item.status === 'completed') {
          await handleCompleted(task)
          await callHaService('todo', 'remove_item', { entity_id: entityId, item: [item.uid] })
          changed = true
        } else {
          const itemDue = item.due ? String(item.due).slice(0, 10) : null
          if (itemDue !== task.dueDate) {
            await callHaService('todo', 'update_item', { entity_id: entityId, item: item.uid, due_date: task.dueDate })
            changed = true
          }
        }
        continue
      }
      if (OUR_ITEM_RE.test(item.summary)) {
        // our item that's no longer scheduled (logged app-side or out of window) — close it out
        await callHaService('todo', 'remove_item', { entity_id: entityId, item: [item.uid] })
        changed = true
      }
    }

    for (const task of desired.values()) {
      if (presentSummaries.has(task.summary)) continue
      await callHaService('todo', 'add_item', {
        entity_id: entityId,
        item: task.summary,
        description: task.description || undefined,
        due_date: task.dueDate,
      })
      changed = true
    }

    if (changed) console.log(`[todo-sync] synced "${entityId}": ${desired.size} planned, ${items.length} items seen`)
  } finally {
    syncing = false
  }
}

async function handleCompleted(task: DesiredTask) {
  const last = db
    .select({ createdAt: careLogs.createdAt })
    .from(careLogs)
    .where(and(eq(careLogs.plantId, task.plantId), eq(careLogs.kind, task.kind)))
    .orderBy(desc(careLogs.createdAt))
    .limit(1)
    .get()
  if (last && Date.now() / 1000 - Number(last.createdAt) < DOUBLE_LOG_GUARD_S) {
    console.log(`[todo-sync] ${task.summary}: care already logged recently — skipping double log`)
    return
  }
  await logCare(task.plantId, task.kind, undefined, undefined, '✅ Wykonane z Home Assistant')
  console.log(`[todo-sync] completed from HA: ${task.summary}`)
}
