import Link from "next/link"
import PlantDetailClient from "@/components/PlantDetailClient"
import { getPlantDetail, getNextCareDates, getPlant } from "@/lib/services/plants"
import { getSensorMappings } from "@/lib/services/sensors"
import { getStates } from "@/lib/ha"
import { getOpbInfo, translateOpbGuide, type OpbPlant } from "@/lib/opb"
import { notFound } from "next/navigation"
import { db } from "@/lib/db"
import { plants } from "@/lib/db/schema"
import { eq } from "drizzle-orm"

export const dynamic = "force-dynamic"

async function getOpbGuideCached(plantId: number, scientificName: string | null): Promise<OpbPlant | null> {
  if (!scientificName) return null
  const plant = await getPlant(plantId)
  if (!plant) return null

  if (plant.opbGuideJson) {
    try {
      return JSON.parse(plant.opbGuideJson) as OpbPlant
    } catch {}
  }

  const opb = await getOpbInfo(scientificName)
  if (!opb) return null

  const translated = await translateOpbGuide(opb)
  db.update(plants).set({ opbGuideJson: JSON.stringify(translated) }).where(eq(plants.id, plantId)).run()
  return translated
}

export default async function PlantPage(props: PageProps<"/plants/[id]">) {
  const { id } = await props.params
  const plantId = Number(id)
  const detail = await getPlantDetail(plantId)
  if (!detail) notFound()
  const [careStatus, opb, allMappings] = await Promise.all([
    getNextCareDates(plantId),
    getOpbGuideCached(plantId, detail.plant.scientificName),
    getSensorMappings(),
  ])
  const plantMappings = allMappings.filter((m) => m.plantId === plantId)
  let entityNames: Record<string, string> = {}
  try {
    const states = await getStates()
    for (const s of states) entityNames[s.entity_id] = (s.attributes.friendly_name as string) ?? s.entity_id
  } catch {}
  return (
    <div>
      <Link href="/" className="text-sm text-zinc-500 hover:underline">
        ← Wróć
      </Link>
      <PlantDetailClient detail={detail} careStatus={careStatus ?? []} opbGuide={opb} sensorMappings={plantMappings} entityNames={entityNames} />
    </div>
  )
}
