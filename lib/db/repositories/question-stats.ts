import type { PoolClient } from "@/lib/db/client"
import { execute } from "@/lib/db/client"
import type { QuestionStatsRecord } from "@/lib/db/types"

type QuestionStatsRow = {
  question_item_id: string
  answer_count: number
  correct_count: number
  wrong_count: number
  correct_streak: number
  wrong_streak: number
  last_answered_at: Date | null
  last_correct_at: Date | null
  last_result: "correct" | "wrong" | null
  stage: QuestionStatsRecord["stage"]
  suspended: boolean
  stability: string | number
  ease: string | number
  difficulty: string | number
  last_interval_seconds: number | null
  ema_accuracy: string | number
  avg_response_time_ms: number | null
  next_due_at: Date | null
  updated_at: Date
}

function toQuestionStatsRecord(row: QuestionStatsRow): QuestionStatsRecord {
  return {
    questionItemId: row.question_item_id,
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
  }
}

export const questionStatsRepository = {
  async findByQuestionItemId(client: PoolClient, questionItemId: string) {
    const result = await execute<QuestionStatsRow>(
      client,
      `select *
         from question_stats
        where question_item_id = $1`,
      [questionItemId]
    )

    return result.rows[0] ? toQuestionStatsRecord(result.rows[0]) : null
  },

  async createIfMissing(client: PoolClient, questionItemId: string) {
    const result = await execute<QuestionStatsRow>(
      client,
      `insert into question_stats (question_item_id)
       values ($1)
       on conflict (question_item_id) do update
         set question_item_id = excluded.question_item_id
       returning *`,
      [questionItemId]
    )

    return toQuestionStatsRecord(result.rows[0])
  },

  async save(client: PoolClient, stats: QuestionStatsRecord) {
    const result = await execute<QuestionStatsRow>(
      client,
      `update question_stats
          set answer_count = $2,
              correct_count = $3,
              wrong_count = $4,
              correct_streak = $5,
              wrong_streak = $6,
              last_answered_at = $7,
              last_correct_at = $8,
              last_result = $9,
              stage = $10,
              suspended = $11,
              stability = $12,
              ease = $13,
              difficulty = $14,
              last_interval_seconds = $15,
              ema_accuracy = $16,
              avg_response_time_ms = $17,
              next_due_at = $18,
              updated_at = $19
        where question_item_id = $1
      returning *`,
      [
        stats.questionItemId,
        stats.answerCount,
        stats.correctCount,
        stats.wrongCount,
        stats.correctStreak,
        stats.wrongStreak,
        stats.lastAnsweredAt,
        stats.lastCorrectAt,
        stats.lastResult,
        stats.stage,
        stats.suspended,
        stats.stability,
        stats.ease,
        stats.difficulty,
        stats.lastIntervalSeconds,
        stats.emaAccuracy,
        stats.avgResponseTimeMs,
        stats.nextDueAt,
        stats.updatedAt,
      ]
    )

    return toQuestionStatsRecord(result.rows[0])
  },
}
