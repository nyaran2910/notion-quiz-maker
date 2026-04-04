import { jsonNoStore, verifySameOrigin } from "@/lib/http"
import { recordQuizAnswer } from "@/lib/notion/quiz"
import type { QuizRequirementKey } from "@/lib/notion/quiz-schema"

export const dynamic = "force-dynamic"

type RecordAnswerPayload = {
  pageId?: string
  isCorrect?: boolean
  mappings?: Partial<Record<QuizRequirementKey, string>>
}

export async function POST(request: Request) {
  try {
    if (!verifySameOrigin(request)) {
      return jsonNoStore({ error: "Forbidden origin" }, { status: 403 })
    }

    const body = (await request.json()) as RecordAnswerPayload

    if (!body.pageId || typeof body.isCorrect !== "boolean" || !body.mappings) {
      return jsonNoStore({ error: "Missing answer payload" }, { status: 400 })
    }

    const stats = await recordQuizAnswer(body.pageId, body.mappings, body.isCorrect)
    return jsonNoStore({ stats })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to record answer"
    const status = message.includes("not connected") ? 401 : 500

    return jsonNoStore({ error: message }, { status })
  }
}
