import Link from "next/link"
import PlantForm from "@/components/PlantForm"

export default async function NewPlantPage(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await props.searchParams
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined)
  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/" className="text-sm text-zinc-500 hover:underline">
        ← Wróć
      </Link>
      <h1 className="mb-5 mt-2 text-2xl font-bold">Dodaj roślinę</h1>
      <PlantForm
        prefill={{
          species: one("species") ?? "",
          scientificName: one("scientificName") ?? "",
          opbId: one("opbId") ?? undefined,
        }}
      />
    </div>
  )
}
