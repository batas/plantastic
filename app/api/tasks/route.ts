import { NextResponse } from 'next/server'
import { getTask, resetStuckTasks } from '@/lib/services/tasks'

export async function GET(_request: Request) {
  resetStuckTasks()
  return NextResponse.json({ ok: true })
}

export async function POST(request: Request) {
  resetStuckTasks()
  const body = await request.json().catch(() => ({}))
  if (!body.taskId) return NextResponse.json({ error: 'taskId required' }, { status: 400 })
  const task = getTask(Number(body.taskId))
  if (!task) return NextResponse.json({ error: 'Nie znaleziono zadania' }, { status: 404 })
  return NextResponse.json(task)
}
