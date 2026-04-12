import { jsonNoStore, verifySameOrigin } from "@/lib/http"
import { getNextQuizQuestion } from "@/lib/quiz/service"

export const dynamic = "force-dynamic"

type NextQuizQuestionPayload = {
  sessionId?: string
}

export async function POST(request: Request) {
  try {
    if (!verifySameOrigin(request)) {
      return jsonNoStore({ error: "Forbidden origin" }, { status: 403 })
    }

    const body = (await request.json()) as NextQuizQuestionPayload

    if (!body.sessionId) {
      return jsonNoStore({ error: "Missing session id" }, { status: 400 })
    }

    const question = await getNextQuizQuestion(body.sessionId)
    return jsonNoStore({ question })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load next question"
    const status = message.includes("not connected") ? 401 : 500

    return jsonNoStore({ error: message }, { status })
  }
}
