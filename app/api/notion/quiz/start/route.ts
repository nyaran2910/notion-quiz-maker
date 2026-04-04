import { jsonNoStore, verifySameOrigin } from "@/lib/http"
import { startQuiz } from "@/lib/notion/quiz"
import type { QuizSourceConfig } from "@/lib/notion/quiz-types"

export const dynamic = "force-dynamic"

type StartQuizPayload = {
  questionCount?: number
  sources?: QuizSourceConfig[]
}

export async function POST(request: Request) {
  try {
    if (!verifySameOrigin(request)) {
      return jsonNoStore({ error: "Forbidden origin" }, { status: 403 })
    }

    const body = (await request.json()) as StartQuizPayload

    if (!body.questionCount || !body.sources || body.sources.length === 0) {
      return jsonNoStore({ error: "Missing quiz configuration" }, { status: 400 })
    }

    const quiz = await startQuiz(body.sources, body.questionCount)
    return jsonNoStore(quiz)
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to start quiz"
    const status = message.includes("not connected") ? 401 : 500

    return jsonNoStore({ error: message }, { status })
  }
}
