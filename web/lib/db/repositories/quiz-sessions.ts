import type { PoolClient } from "@/lib/db/client"
import { execute } from "@/lib/db/client"
import type { QuizSessionRecord } from "@/lib/db/types"

type QuizSessionRow = {
  id: string
  user_id: string
  quiz_set_id: string
  started_at: Date
  ended_at: Date | null
  question_count: number
  correct_count: number
  mode: string | null
  recent_question_ids: unknown
  last_category: string | null
}

function toQuizSessionRecord(row: QuizSessionRow): QuizSessionRecord {
  return {
    id: row.id,
    userId: row.user_id,
    quizSetId: row.quiz_set_id,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    questionCount: row.question_count,
    correctCount: row.correct_count,
    mode: row.mode,
    recentQuestionIds: Array.isArray(row.recent_question_ids)
      ? row.recent_question_ids.filter((value): value is string => typeof value === "string")
      : [],
    lastCategory: row.last_category,
  }
}

export const quizSessionsRepository = {
  async findById(client: PoolClient, sessionId: string) {
    const result = await execute<QuizSessionRow>(client, "select * from quiz_sessions where id = $1", [sessionId])
    return result.rows[0] ? toQuizSessionRecord(result.rows[0]) : null
  },

  async updateProgress(
    client: PoolClient,
    sessionId: string,
    progress: Pick<QuizSessionRecord, "questionCount" | "correctCount" | "recentQuestionIds" | "lastCategory">
  ) {
    const result = await execute<QuizSessionRow>(
      client,
      `update quiz_sessions
          set question_count = $2,
              correct_count = $3,
              recent_question_ids = $4::jsonb,
              last_category = $5
        where id = $1
      returning *`,
      [sessionId, progress.questionCount, progress.correctCount, JSON.stringify(progress.recentQuestionIds), progress.lastCategory]
    )

    return toQuizSessionRecord(result.rows[0])
  },

  async endSession(client: PoolClient, sessionId: string, endedAt: Date) {
    const result = await execute<QuizSessionRow>(
      client,
      `update quiz_sessions
          set ended_at = coalesce(ended_at, $2)
        where id = $1
      returning *`,
      [sessionId, endedAt]
    )

    return result.rows[0] ? toQuizSessionRecord(result.rows[0]) : null
  },
}
