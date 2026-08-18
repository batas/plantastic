import { generateCarePlan } from '@/lib/llm'
import { healthCheck } from '@/lib/llm/identify'
import { addTimelineEntry } from '@/lib/services/care'
import { updateTask } from '@/lib/services/tasks'
import type { TaskType } from '@/lib/services/tasks'

const now = () => Math.floor(Date.now() / 1000)

async function processCarePlan(taskId: number, plantId: number) {
  updateTask(taskId, { status: 'running', progress: 10, startedAt: now() })

  try {
    updateTask(taskId, { progress: 30 })
    const result = await generateCarePlan(plantId)
    updateTask(taskId, { progress: 80 })

    await addTimelineEntry(plantId, {
      kind: 'care_plan',
      title: `Plan pielęgnacji (${result.provider}: ${result.model})`,
      content: result.plan,
      dataJson: JSON.stringify({ provider: result.provider, model: result.model, format: 'markdown' }),
    })

    updateTask(taskId, {
      status: 'done',
      progress: 100,
      resultJson: JSON.stringify({ plan: result.plan, provider: result.provider, model: result.model }),
      finishedAt: now(),
    })
  } catch (err) {
    updateTask(taskId, {
      status: 'failed',
      error: err instanceof Error ? err.message : 'Nieznany błąd',
      finishedAt: now(),
    })
  }
}

async function processHealth(taskId: number, plantId: number) {
  updateTask(taskId, { status: 'running', progress: 10, startedAt: now() })

  try {
    updateTask(taskId, { progress: 20 })
    const verdict = await healthCheck(plantId)
    updateTask(taskId, { progress: 80 })

    const content = [
      verdict.summary,
      ...(verdict.issues.length ? ['Problemy: ' + verdict.issues.join('; ')] : []),
      ...verdict.advice.map((a) => `• ${a}`),
    ].join('\n')

    await addTimelineEntry(plantId, {
      kind: 'care_plan',
      title: 'Przegląd stanu',
      content,
      dataJson: JSON.stringify({ type: 'health', ...verdict }),
    })

    updateTask(taskId, {
      status: 'done',
      progress: 100,
      resultJson: JSON.stringify(verdict),
      finishedAt: now(),
    })
  } catch (err) {
    updateTask(taskId, {
      status: 'failed',
      error: err instanceof Error ? err.message : 'Nieznany błąd',
      finishedAt: now(),
    })
  }
}

const processors: Record<string, (taskId: number, plantId: number) => Promise<void>> = {
  care_plan: processCarePlan,
  health: processHealth,
}

export async function processTask(taskId: number, type: TaskType, plantId: number) {
  const processor = processors[type]
  if (!processor) {
    updateTask(taskId, { status: 'failed', error: `Nieznany typ zadania: ${type}`, finishedAt: now() })
    return
  }
  await processor(taskId, plantId)
}
