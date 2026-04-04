import { NextResponse } from "next/server"

import { createQuizProperty } from "@/lib/notion/api"
import type { QuizRequirementKey } from "@/lib/notion/quiz-schema"

export const dynamic = "force-dynamic"

export async function POST(
  request: Request,
  context: RouteContext<"/api/notion/data-sources/[id]/properties">
) {
  const { id } = await context.params

  try {
    const body = (await request.json()) as { requirementKey?: QuizRequirementKey }

    if (!body.requirementKey) {
      return NextResponse.json({ error: "Missing requirementKey" }, { status: 400 })
    }

    const schema = await createQuizProperty(id, body.requirementKey)
    return NextResponse.json({ schema })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create property"
    const status = message.includes("not connected") ? 401 : 500

    return NextResponse.json({ error: message }, { status })
  }
}
