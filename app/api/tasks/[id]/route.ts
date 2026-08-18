import { NextResponse } from 'next/server'
import { getTask } from '@/lib/services/tasks'

export async function GET(_request: Request, ctx: RouteContext<'/api/tasks/[id]'>) {
  const { id } = await ctx.params
  const task = getTask(Number(id))
  if (!task) return NextResponse.json({ error: 'Nie znaleziono zadania' }, { status: 404 })
  return NextResponse.json(task)
}
