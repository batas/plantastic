import Link from "next/link"
import PlantForm from "@/components/PlantForm"
import { getPlant } from "@/lib/services/plants"
import { notFound } from "next/navigation"

export const dynamic = "force-dynamic"

export default async function EditPlantPage(props: PageProps<"/plants/[id]/edit">) {
  const { id } = await props.params
  const plant = await getPlant(Number(id))
  if (!plant) notFound()
  return (
    <div className="mx-auto max-w-2xl">
      <Link href={`/plants/${plant.id}`} className="text-sm text-zinc-500 hover:underline">
        ← Wróć
      </Link>
      <h1 className="mb-5 mt-2 text-2xl font-bold">Edytuj: {plant.name}</h1>
      <PlantForm plant={plant} />
    </div>
  )
}
