import { NextResponse } from 'next/server'
import { createTask, getPlantTasks, getTaskSteps, type TaskType } from '@/lib/services/tasks'
import { processTask } from '@/lib/services/task-processors'
import { getPlant } from '@/lib/services/plants'

const VALID_TYPES = new Set(['care_plan', 'health'])

export async function GET(_request: Request, ctx: RouteContext<'/api/plants/[id]/tasks'>) {
  const { id } = await ctx.params
  const plantId = Number(id)
  const tasks = getPlantTasks(plantId)
  return NextResponse.json(tasks)
}

export async function POST(request: Request, ctx: RouteContext<'/api/plants/[id]/tasks'>) {
  const { id } = await ctx.params
  const plantId = Number(id)
  const body = await request.json().catch(() => ({}))
  const type: TaskType = body.type

  if (!VALID_TYPES.has(type)) {
    return NextResponse.json({ error: `Nieprawidłowy typ: ${type}. Dozwolone: care_plan, health` }, { status: 400 })
  }

  if (!(await getPlant(plantId))) {
    return NextResponse.json({ error: 'Nie znaleziono rośliny' }, { status: 404 })
  }

  const task = createTask(type, plantId)

  // Fire and forget — process in background
  processTask(task.id, type, plantId).catch((err) => {
    console.error(`[task ${task.id}] unhandled:`, err)
  })

  return NextResponse.json({
    taskId: task.id,
    type: task.type,
    status: task.status,
    steps: getTaskSteps(type),
  }, { status: 202 })
}
