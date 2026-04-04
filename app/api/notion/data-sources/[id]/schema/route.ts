import { NextResponse } from "next/server"

import { getDataSourceSchema } from "@/lib/notion/api"

export const dynamic = "force-dynamic"

export async function GET(_request: Request, context: RouteContext<"/api/notion/data-sources/[id]/schema">) {
  const { id } = await context.params

  try {
    const schema = await getDataSourceSchema(id)
    return NextResponse.json({ schema })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load schema"
    const status = message.includes("not connected") ? 401 : 500

    return NextResponse.json({ error: message }, { status })
  }
}
