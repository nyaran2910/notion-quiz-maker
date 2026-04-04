import { NextResponse } from "next/server"

import { listAccessibleDataSources } from "@/lib/notion/api"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const dataSources = await listAccessibleDataSources()
    return NextResponse.json({ dataSources })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load data sources"
    const status = message.includes("not connected") ? 401 : 500

    return NextResponse.json({ error: message }, { status })
  }
}
