import { jsonNoStore, verifySameOrigin } from "@/lib/http"
import type { QuizSourceConfig } from "@/lib/notion/quiz-types"
import { createQuizSet, listQuizSets } from "@/lib/quiz-set/service"

export const dynamic = "force-dynamic"

type CreateQuizSetPayload = {
  name?: string
  description?: string | null
  sources?: QuizSourceConfig[]
}

export async function GET() {
  try {
    const quizSets = await listQuizSets()
    return jsonNoStore({ quizSets })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load quiz sets"
    const status = message.includes("App session") ? 401 : 500
    return jsonNoStore({ error: message }, { status })
  }
}

export async function POST(request: Request) {
  try {
    if (!verifySameOrigin(request)) {
      return jsonNoStore({ error: "Forbidden origin" }, { status: 403 })
    }

    const body = (await request.json()) as CreateQuizSetPayload

    if (!body.name?.trim() || !body.sources || body.sources.length === 0) {
      return jsonNoStore({ error: "Missing quiz set payload" }, { status: 400 })
    }

    const quizSet = await createQuizSet({
      name: body.name.trim(),
      description: body.description?.trim() || null,
      sources: body.sources,
    })

    return jsonNoStore({ quizSet })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create quiz set"
    const status = message.includes("session") ? 401 : 500
    return jsonNoStore({ error: message }, { status })
  }
}
