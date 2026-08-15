import Link from "next/link"
import PlantCard from "@/components/PlantCard"
import { getDashboard } from "@/lib/services/dashboard"
import { CARE_META, type CareType } from "@/lib/care-types"

export const dynamic = "force-dynamic"

export default async function DashboardPage() {
  const { plants, tasks, now } = await getDashboard()
  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Moje rośliny</h1>
        <div className="flex gap-2">
          <Link
            href="/identify"
            className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700"
          >
            📷 Rozpoznaj roślinę
          </Link>
          <Link
            href="/plants/new"
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
          >
            + Dodaj roślinę
          </Link>
        </div>
      </div>

      {tasks.length > 0 && (
        <section className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/40">
          <h2 className="mb-2 font-semibold text-amber-900 dark:text-amber-200">
            ⏰ Do zrobienia {tasks.some((t) => t.overdue) ? "(zaległe!)" : ""}
          </h2>
          <ul className="space-y-1 text-sm">
            {tasks.map((t) => {
              const meta = CARE_META[t.type as CareType]
              return (
                <li key={`${t.plantId}-${t.type}`}>
                  <Link href={`/plants/${t.plantId}`} className="hover:underline">
                    {t.overdue ? "🔴" : t.dueAt && t.dueAt <= now + 3600 ? "🟡" : "🟢"}{" "}
                    {meta.icon} {meta.label} — {t.plantName}
                  </Link>{" "}
                  <span className="text-xs text-amber-700/70 dark:text-amber-300/70">
                    ({t.overdue ? "zaległe" : dueText(t.dueAt, now)})
                  </span>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {plants.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-300 p-10 text-center text-zinc-500 dark:border-zinc-700">
          <p className="text-4xl">🪴</p>
          <p className="mt-2">Nie masz jeszcze żadnych roślin.</p>
          <p className="mt-1 text-sm">Dodaj pierwszą roślinę albo rozpoznaj ją ze zdjęcia, żeby zacząć.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {plants.map((item) => (
            <PlantCard key={item.plant.id} item={item} />
          ))}
        </div>
      )}
    </div>
  )
}

function dueText(dueAt: number | null, now: number) {
  if (!dueAt) return ""
  const days = Math.ceil((dueAt - now) / 86400)
  return days <= 0 ? "dzisiaj" : `za ${days} dni`
}
