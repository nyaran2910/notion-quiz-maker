import { createQuizProperty } from "@/lib/notion/api"
import { jsonNoStore, verifySameOrigin } from "@/lib/http"
import type { QuizRequirementKey } from "@/lib/notion/quiz-schema"

export const dynamic = "force-dynamic"

export async function POST(
  request: Request,
  context: RouteContext<"/api/notion/data-sources/[id]/properties">
) {
  const { id } = await context.params

  try {
    if (!verifySameOrigin(request)) {
      return jsonNoStore({ error: "Forbidden origin" }, { status: 403 })
    }

    const body = (await request.json()) as { requirementKey?: QuizRequirementKey }

    if (!body.requirementKey) {
      return jsonNoStore({ error: "Missing requirementKey" }, { status: 400 })
    }

    const schema = await createQuizProperty(id, body.requirementKey)
    return jsonNoStore({ schema })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create property"
    const status = message.includes("not connected") ? 401 : 500

    return jsonNoStore({ error: message }, { status })
  }
}
