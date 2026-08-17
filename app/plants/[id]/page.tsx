import Link from "next/link"
import PlantDetailClient from "@/components/PlantDetailClient"
import { getPlantDetail, getNextCareDates } from "@/lib/services/plants"
import { getOpbInfo } from "@/lib/opb"
import { notFound } from "next/navigation"

export const dynamic = "force-dynamic"

export default async function PlantPage(props: PageProps<"/plants/[id]">) {
  const { id } = await props.params
  const detail = await getPlantDetail(Number(id))
  if (!detail) notFound()
  const [careStatus, opb] = await Promise.all([
    getNextCareDates(Number(id)),
    getOpbInfo(detail.plant.scientificName),
  ])
  return (
    <div>
      <Link href="/" className="text-sm text-zinc-500 hover:underline">
        ← Wróć
      </Link>
      <PlantDetailClient detail={detail} careStatus={careStatus ?? []} opbGuide={opb} />
    </div>
  )
}
