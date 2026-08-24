import { generateCarePlan, generateSensorReminder } from '@/lib/llm'
import { healthCheck } from '@/lib/llm/identify'
import { addTimelineEntry } from '@/lib/services/care'
import { upsertOverride } from '@/lib/services/care-overrides'
import { getPlant, updatePlant } from '@/lib/services/plants'
import { CARE_META, type CareType } from '@/lib/care-types'
import { updateTask } from '@/lib/services/tasks'
import type { TaskType } from '@/lib/services/tasks'

const now = () => Math.floor(Date.now() / 1000)

const KIND_BY_INTERVAL_FIELD = new Map(
  Object.entries(CARE_META).map(([kind, meta]) => [meta.intervalField as string | null, kind as CareType]),
)

async function processCarePlan(taskId: number, plantId: number) {
  updateTask(taskId, { status: 'running', progress: 10, startedAt: now() })

  try {
    updateTask(taskId, { progress: 30 })
    const before = await getPlant(plantId)
    const result = await generateCarePlan(plantId)
    updateTask(taskId, { progress: 80 })

    const intervalChanges: { kind: string; icon: string; label: string; before: number | null; after: number }[] = []
    if (result.intervals) {
      const patch: Record<string, number> = {}
      for (const [field, value] of Object.entries(result.intervals)) {
        if (typeof value !== 'number' || value <= 0) continue
        patch[field] = value
        const prev = before?.[field as keyof typeof before]
        const beforeVal = typeof prev === 'number' ? prev : null
        if (beforeVal !== value) {
          const kind = KIND_BY_INTERVAL_FIELD.get(field)
          const meta = kind ? CARE_META[kind] : null
          intervalChanges.push({
            kind: kind ?? field,
            icon: meta?.icon ?? '📅',
            label: meta?.label ?? field,
            before: beforeVal,
            after: value,
          })
        }
      }
      if (Object.keys(patch).length > 0) await updatePlant(plantId, patch)
    }

    await addTimelineEntry(plantId, {
      kind: 'care_plan',
      title: `Plan pielęgnacji (${result.provider}: ${result.model})`,
      content: result.plan,
      dataJson: JSON.stringify({
        provider: result.provider,
        model: result.model,
        format: 'markdown',
        ...(intervalChanges.length > 0 ? { intervalChanges } : {}),
      }),
    })

    updateTask(taskId, {
      status: 'done',
      progress: 100,
      resultJson: JSON.stringify({ plan: result.plan, provider: result.provider, model: result.model, intervalChanges }),
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

async function processSensorCheck(taskId: number, plantId: number) {
  updateTask(taskId, { status: 'running', progress: 10, startedAt: now() })

  try {
    updateTask(taskId, { progress: 30 })
    const result = await generateSensorReminder(plantId)
    updateTask(taskId, { progress: 80 })

    if (result.action !== 'none') {
      const actionLabels: Record<string, string> = { water: 'Podlewanie', mist: 'Zraszanie', rotate: 'Obracanie' }
      const hardOverride = result.urgency !== 'low'
      const dueInDays = result.urgency === 'high' ? 0 : 1
      await addTimelineEntry(plantId, {
        kind: 'event',
        title: `Przypomnienie: ${actionLabels[result.action] ?? result.action}`,
        content: hardOverride ? `${result.reason}\n\n⚡ AI przyspieszyło termin zabiegu.` : result.reason,
        dataJson: JSON.stringify({
          action: result.action,
          urgency: result.urgency,
          source: 'sensor_check',
          ...(hardOverride ? { override: true } : {}),
        }),
      })
      if (hardOverride) {
        upsertOverride(plantId, result.action, now() + dueInDays * 86400, result.reason, result.urgency)
        console.log(`[sensor-check] override: plant=${plantId} kind=${result.action} urgency=${result.urgency}`)
      }
    }

    updateTask(taskId, {
      status: 'done',
      progress: 100,
      resultJson: JSON.stringify(result),
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
  sensor_check: processSensorCheck,
}

export async function processTask(taskId: number, type: TaskType, plantId: number) {
  const processor = processors[type]
  if (!processor) {
    updateTask(taskId, { status: 'failed', error: `Nieznany typ zadania: ${type}`, finishedAt: now() })
    return
  }
  await processor(taskId, plantId)
}
