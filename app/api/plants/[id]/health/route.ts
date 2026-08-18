import { NextResponse } from 'next/server'
import { createTask, getTaskSteps } from '@/lib/services/tasks'
import { processTask } from '@/lib/services/task-processors'
import { getPlant } from '@/lib/services/plants'

export async function POST(_request: Request, ctx: RouteContext<'/api/plants/[id]/health'>) {
  const { id } = await ctx.params
  const plantId = Number(id)
  if (!(await getPlant(plantId))) return NextResponse.json({ error: 'Nie znaleziono rośliny' }, { status: 404 })

  const task = createTask('health', plantId)

  processTask(task.id, 'health', plantId).catch((err) => {
    console.error(`[task ${task.id}] unhandled:`, err)
  })

  return NextResponse.json({
    taskId: task.id,
    status: 'pending',
    steps: getTaskSteps('health'),
  }, { status: 202 })
}
