import { jsonNoStore, verifySameOrigin } from "@/lib/http"
import type { QuizSourceConfig } from "@/lib/notion/quiz-types"
import { deleteQuizSet, updateQuizSet } from "@/lib/quiz-set/service"

export const dynamic = "force-dynamic"

type UpdateQuizSetPayload = {
  name?: string
  description?: string | null
  sources?: QuizSourceConfig[]
}

export async function PATCH(request: Request, context: RouteContext<"/api/quiz-sets/[id]">) {
  try {
    if (!verifySameOrigin(request)) {
      return jsonNoStore({ error: "Forbidden origin" }, { status: 403 })
    }

    const { id } = await context.params
    const body = (await request.json()) as UpdateQuizSetPayload

    if (!body.name?.trim() || !body.sources || body.sources.length === 0) {
      return jsonNoStore({ error: "Missing quiz set payload" }, { status: 400 })
    }

    const quizSet = await updateQuizSet(id, {
      name: body.name.trim(),
      description: body.description?.trim() || null,
      sources: body.sources,
    })

    return jsonNoStore({ quizSet })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update quiz set"
    const status = message.includes("session") ? 401 : 500
    return jsonNoStore({ error: message }, { status })
  }
}

export async function DELETE(request: Request, context: RouteContext<"/api/quiz-sets/[id]">) {
  try {
    if (!verifySameOrigin(request)) {
      return jsonNoStore({ error: "Forbidden origin" }, { status: 403 })
    }

    const { id } = await context.params
    await deleteQuizSet(id)
    return jsonNoStore({ ok: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete quiz set"
    const status = message.includes("session") ? 401 : 500
    return jsonNoStore({ error: message }, { status })
  }
}
