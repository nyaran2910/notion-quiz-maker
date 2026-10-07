import { listAccessibleDataSources } from "@/lib/notion/api"
import { jsonNoStore } from "@/lib/http"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const dataSources = await listAccessibleDataSources()
    return jsonNoStore({ dataSources })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load data sources"
    const status = message.includes("not connected") ? 401 : 500

    return jsonNoStore({ error: message }, { status })
  }
}
