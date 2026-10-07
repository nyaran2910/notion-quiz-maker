import type { PoolClient } from "@/lib/db/client"
import { execute } from "@/lib/db/client"
import type { AnswerEventInsert } from "@/lib/db/types"

type AnswerEventRow = {
  id: string
}

export const answerEventsRepository = {
  async insert(client: PoolClient, event: AnswerEventInsert) {
    const result = await execute<AnswerEventRow>(
      client,
      `insert into answer_events (
         user_id,
         question_item_id,
         quiz_session_id,
         quiz_set_id,
         answered_at,
         is_correct,
         response_ms,
         scheduled_after_questions,
         retry_enqueued,
         stage_before,
         stage_after,
         answer_payload
       ) values (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12
       )
       returning id`,
      [
        event.userId,
        event.questionItemId,
        event.quizSessionId,
        event.quizSetId,
        event.answeredAt,
        event.isCorrect,
        event.responseMs,
        event.scheduledAfterQuestions,
        event.retryEnqueued,
        event.stageBefore,
        event.stageAfter,
        event.answerPayload,
      ]
    )

    return result.rows[0].id
  },
}
