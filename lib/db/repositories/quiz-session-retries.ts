import type { PoolClient } from "@/lib/db/client"
import { execute } from "@/lib/db/client"
import type { QuizSessionRetryRecord } from "@/lib/db/types"

type QuizSessionRetryRow = {
  id: string
  quiz_session_id: string
  question_item_id: string
  available_after_position: number
  consumed_at: Date | null
  created_at: Date
}

function toQuizSessionRetryRecord(row: QuizSessionRetryRow): QuizSessionRetryRecord {
  return {
    id: row.id,
    quizSessionId: row.quiz_session_id,
    questionItemId: row.question_item_id,
    availableAfterPosition: row.available_after_position,
    consumedAt: row.consumed_at,
    createdAt: row.created_at,
  }
}

export const quizSessionRetriesRepository = {
  async enqueue(client: PoolClient, quizSessionId: string, questionItemId: string, availableAfterPosition: number) {
    const result = await execute<QuizSessionRetryRow>(
      client,
      `insert into quiz_session_retries (quiz_session_id, question_item_id, available_after_position)
       values ($1, $2, $3)
       on conflict (quiz_session_id, question_item_id, available_after_position) do update
         set question_item_id = excluded.question_item_id
       returning *`,
      [quizSessionId, questionItemId, availableAfterPosition]
    )

    return toQuizSessionRetryRecord(result.rows[0])
  },

  async listAvailable(client: PoolClient, quizSessionId: string, currentPosition: number) {
    const result = await execute<QuizSessionRetryRow>(
      client,
      `select *
         from quiz_session_retries
        where quiz_session_id = $1
          and consumed_at is null
          and available_after_position <= $2
        order by available_after_position asc, created_at asc`,
      [quizSessionId, currentPosition]
    )

    return result.rows.map(toQuizSessionRetryRecord)
  },

  async consume(client: PoolClient, retryId: string, consumedAt: Date) {
    const result = await execute<QuizSessionRetryRow>(
      client,
      `update quiz_session_retries
          set consumed_at = $2
        where id = $1
      returning *`,
      [retryId, consumedAt]
    )

    return result.rows[0] ? toQuizSessionRetryRecord(result.rows[0]) : null
  },
}
