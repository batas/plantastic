import { NextResponse } from 'next/server'
import { listTodoEntities } from '@/lib/services/todo-sync'

export async function GET() {
  try {
    const todos = await listTodoEntities()
    return NextResponse.json(todos)
  } catch (err) {
    return NextResponse.json({ error: 'Nie udało się pobrać list HA To-do', details: err instanceof Error ? err.message : String(err) }, { status: 502 })
  }
}
