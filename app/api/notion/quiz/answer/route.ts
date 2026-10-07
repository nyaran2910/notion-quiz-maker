import { jsonNoStore, verifySameOrigin } from "@/lib/http"
import { recordQuizAnswer } from "@/lib/quiz/service"
import type { QuizRequirementKey } from "@/lib/notion/quiz-schema"

export const dynamic = "force-dynamic"

type RecordAnswerPayload = {
  pageId?: string
  questionItemId?: string
  sessionId?: string
  isCorrect?: boolean
  questionPosition?: number
  responseTimeMs?: number | null
  mappings?: Partial<Record<QuizRequirementKey, string>>
}

export async function POST(request: Request) {
  try {
    if (!verifySameOrigin(request)) {
      return jsonNoStore({ error: "Forbidden origin" }, { status: 403 })
    }

    const body = (await request.json()) as RecordAnswerPayload

    if (typeof body.isCorrect !== "boolean") {
      return jsonNoStore({ error: "Missing answer payload" }, { status: 400 })
    }

    const stats = await recordQuizAnswer({
      pageId: body.pageId,
      questionItemId: body.questionItemId,
      sessionId: body.sessionId,
      isCorrect: body.isCorrect,
      questionPosition: body.questionPosition,
      responseTimeMs: body.responseTimeMs,
      mappings: body.mappings,
    })
    return jsonNoStore({ stats })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to record answer"
    const status = message.includes("not connected") ? 401 : 500

    return jsonNoStore({ error: message }, { status })
  }
}
