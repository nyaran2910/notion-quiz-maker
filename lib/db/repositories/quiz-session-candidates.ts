import type { PoolClient } from "@/lib/db/client"
import { execute } from "@/lib/db/client"
import type { QuestionSelectionCandidate, QuizQuestionContent } from "@/lib/db/types"

type QuizSessionCandidateRow = {
  question_item_id: string
  category: string | null
  content_cache: QuizQuestionContent | null
  answer_count: number
  correct_count: number
  wrong_count: number
  correct_streak: number
  wrong_streak: number
  last_answered_at: Date | null
  last_correct_at: Date | null
  last_result: "correct" | "wrong" | null
  stage: QuestionSelectionCandidate["stage"]
  suspended: boolean
  stability: string | number
  ease: string | number
  difficulty: string | number
  last_interval_seconds: number | null
  ema_accuracy: string | number
  avg_response_time_ms: number | null
  next_due_at: Date | null
  updated_at: Date
  retry_id: string | null
}

export type QuizSessionCandidateRecord = {
  selection: QuestionSelectionCandidate
  content: QuizQuestionContent | null
  retryId: string | null
}

function toRecord(row: QuizSessionCandidateRow): QuizSessionCandidateRecord {
  return {
    selection: {
      questionItemId: row.question_item_id,
      category: row.category,
      sessionRetryQueued: Boolean(row.retry_id),
      answerCount: row.answer_count,
      correctCount: row.correct_count,
      wrongCount: row.wrong_count,
      correctStreak: row.correct_streak,
      wrongStreak: row.wrong_streak,
      lastAnsweredAt: row.last_answered_at,
      lastCorrectAt: row.last_correct_at,
      lastResult: row.last_result,
      stage: row.stage,
      suspended: row.suspended,
      stability: Number(row.stability),
      ease: Number(row.ease),
      difficulty: Number(row.difficulty),
      lastIntervalSeconds: row.last_interval_seconds,
      emaAccuracy: Number(row.ema_accuracy),
      avgResponseTimeMs: row.avg_response_time_ms,
      nextDueAt: row.next_due_at,
      updatedAt: row.updated_at,
    },
    content: row.content_cache,
    retryId: row.retry_id,
  }
}

export const quizSessionCandidatesRepository = {
  async listForSession(client: PoolClient, sessionId: string, currentPosition: number) {
    const result = await execute<QuizSessionCandidateRow>(
      client,
      `select
         qi.id as question_item_id,
         qi.category,
         qi.content_cache,
         qs.answer_count,
         qs.correct_count,
         qs.wrong_count,
         qs.correct_streak,
         qs.wrong_streak,
         qs.last_answered_at,
         qs.last_correct_at,
         qs.last_result,
         qs.stage,
         qs.suspended,
         qs.stability,
         qs.ease,
         qs.difficulty,
         qs.last_interval_seconds,
         qs.ema_accuracy,
         qs.avg_response_time_ms,
         qs.next_due_at,
         qs.updated_at,
         retry.id as retry_id
       from quiz_sessions session
       join quiz_set_sources qss
         on qss.quiz_set_id = session.quiz_set_id
       join question_items qi
         on qi.notion_data_source_id = qss.notion_data_source_id
       join question_stats qs
         on qs.question_item_id = qi.id
       left join lateral (
         select id
           from quiz_session_retries retry
          where retry.quiz_session_id = session.id
            and retry.question_item_id = qi.id
            and retry.consumed_at is null
            and retry.available_after_position <= $2
          order by retry.available_after_position asc, retry.created_at asc
          limit 1
       ) retry on true
      where session.id = $1`,
      [sessionId, currentPosition]
    )

    return result.rows.map(toRecord)
  },

  async listForDataSourceIds(client: PoolClient, dataSourceIds: string[]) {
    if (dataSourceIds.length === 0) {
      return []
    }

    const result = await execute<QuizSessionCandidateRow>(
      client,
      `select
         qi.id as question_item_id,
         qi.category,
         qi.content_cache,
         qs.answer_count,
         qs.correct_count,
         qs.wrong_count,
         qs.correct_streak,
         qs.wrong_streak,
         qs.last_answered_at,
         qs.last_correct_at,
         qs.last_result,
         qs.stage,
         qs.suspended,
         qs.stability,
         qs.ease,
         qs.difficulty,
         qs.last_interval_seconds,
         qs.ema_accuracy,
         qs.avg_response_time_ms,
         qs.next_due_at,
         qs.updated_at,
         null::text as retry_id
       from question_items qi
       join question_stats qs
         on qs.question_item_id = qi.id
      where qi.notion_data_source_id = any($1::uuid[])`,
      [dataSourceIds]
    )

    return result.rows.map(toRecord)
  },
}
