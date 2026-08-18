import { eq, and, or, lt } from 'drizzle-orm'
import { db } from '@/lib/db'
import { asyncTasks } from '@/lib/db/schema'

export type TaskType = 'care_plan' | 'health' | 'identify'
export type TaskStatus = 'pending' | 'running' | 'done' | 'failed'

export interface TaskResult {
  provider?: string
  model?: string
  [key: string]: unknown
}

export function createTask(type: TaskType, plantId?: number) {
  return db.insert(asyncTasks).values({ type, plantId: plantId ?? null }).returning().get()
}

export function getTask(id: number) {
  return db.select().from(asyncTasks).where(eq(asyncTasks.id, id)).get()
}

export function getPlantTasks(plantId: number, limit = 20) {
  return db
    .select()
    .from(asyncTasks)
    .where(eq(asyncTasks.plantId, plantId))
    .orderBy(asyncTasks.createdAt)
    .limit(limit)
    .all()
}

export function updateTask(id: number, patch: Partial<{ status: TaskStatus; progress: number; resultJson: string; error: string; startedAt: number; finishedAt: number }>) {
  db.update(asyncTasks).set(patch).where(eq(asyncTasks.id, id)).run()
}

const STALE_THRESHOLD = 300 // 5 minutes

export function resetStuckTasks() {
  const cutoff = Math.floor(Date.now() / 1000) - STALE_THRESHOLD
  const stuck = db
    .select()
    .from(asyncTasks)
    .where(
      and(
        or(eq(asyncTasks.status, 'pending'), eq(asyncTasks.status, 'running')),
        lt(asyncTasks.createdAt, cutoff),
      ),
    )
    .all()

  for (const task of stuck) {
    db.update(asyncTasks)
      .set({ status: 'failed', error: 'Przerwano — przekroczono limit czasu', finishedAt: Math.floor(Date.now() / 1000) })
      .where(eq(asyncTasks.id, task.id))
      .run()
  }

  return stuck.length
}

const TASK_PROGRESS: Record<string, { steps: string[] }> = {
  care_plan: { steps: ['Przygotowywanie danych', 'Analiza AI', 'Zapisywanie'] },
  health: { steps: ['Ładowanie zdjęć', 'Analiza wizualna', 'Ocena zdrowia', 'Zapisywanie'] },
  identify: { steps: ['Przesyłanie zdjęcia', 'Analiza AI'] },
}

export function getTaskSteps(type: string): string[] {
  return TASK_PROGRESS[type]?.steps ?? ['Przetwarzanie']
}
