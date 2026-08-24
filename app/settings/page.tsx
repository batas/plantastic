import SettingsClient from "@/components/SettingsClient"
import { getConfig } from "@/lib/settings"
import { listSensorMappings } from "@/lib/services/sensors"
import { listPlants } from "@/lib/services/plants"
import { isConnected } from "@/lib/mqtt"

export const dynamic = "force-dynamic"

export default async function SettingsPage() {
  const cfg = getConfig()
  const mappings = await listSensorMappings()
  const plants = await listPlants()
  const plantsWithNames = await Promise.all(
    mappings.map(async (m) => ({ ...m, plantName: plants.find((p) => p.id === m.plantId)?.name ?? null })),
  )
  return (
    <SettingsClient
      initial={{
        settings: {
          mqtt: {
            host: cfg.mqtt?.host ?? "",
            port: cfg.mqtt?.port ?? 1883,
            user: cfg.mqtt?.user ?? "",
            hasPassword: Boolean(cfg.mqtt?.password),
          },
          ha: {
            url: cfg.ha?.url ?? "",
            hasToken: Boolean(cfg.ha?.token),
            todoEntity: cfg.ha?.todoEntity ?? "",
            notifyEnabled: cfg.ha?.notifyEnabled !== false,
            notifyDaysOverdue: cfg.ha?.notifyDaysOverdue ?? 1,
          },
          llm: {
            provider: cfg.llm?.provider ?? "ollama",
            model: cfg.llm?.model ?? "",
            hasApiKey: Boolean(cfg.llm?.apiKey),
            baseUrl: cfg.llm?.baseUrl ?? "",
          },
          opb: { hasClientId: Boolean(cfg.opb?.clientId), hasSecret: Boolean(cfg.opb?.secret) },
          connected: isConnected(),
        },
        mappings: plantsWithNames,
        plants: plants.map((p) => ({ id: p.id, name: p.name })),
      }}
    />
  )
}
