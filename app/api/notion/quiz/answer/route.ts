import { NextResponse } from "next/server"

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
    const body = (await request.json()) as RecordAnswerPayload

    if (!body.pageId || typeof body.isCorrect !== "boolean" || !body.mappings) {
      return NextResponse.json({ error: "Missing answer payload" }, { status: 400 })
    }

    const stats = await recordQuizAnswer(body.pageId, body.mappings, body.isCorrect)
    return NextResponse.json({ stats })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to record answer"
    const status = message.includes("not connected") ? 401 : 500

    return NextResponse.json({ error: message }, { status })
  }
}
