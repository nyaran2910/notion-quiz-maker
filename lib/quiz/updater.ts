import { adjustedAccuracy } from "@/lib/quiz/scoring"
import type { QuestionStage, QuestionStatsRecord } from "@/lib/db/types"

const EMA_WEIGHT = 0.2
const TEN_MINUTES_IN_SECONDS = 600
const ONE_DAY_IN_SECONDS = 86_400
const STABILITY_CAP_IN_DAYS = 180
const LEARNING_INTERVALS_IN_SECONDS = [
  TEN_MINUTES_IN_SECONDS,
  ONE_DAY_IN_SECONDS,
  3 * ONE_DAY_IN_SECONDS,
  7 * ONE_DAY_IN_SECONDS,
  14 * ONE_DAY_IN_SECONDS,
]

export type UpdateAfterAnswerInput = {
  stats: QuestionStatsRecord
  isCorrect: boolean
  responseTimeMs?: number | null
  now?: Date
}

function getTimeFactor(responseTimeMs?: number | null) {
  if (!responseTimeMs || responseTimeMs <= 5_000) {
    return 1
  }

  if (responseTimeMs <= 12_000) {
    return 0.8
  }

  return 0.6
}

function calculateAverageResponseTime(previous: number | null, responseTimeMs?: number | null) {
  if (!responseTimeMs || responseTimeMs <= 0) {
    return previous
  }

  if (!previous || previous <= 0) {
    return Math.round(responseTimeMs)
  }

  return Math.round(previous * 0.7 + responseTimeMs * 0.3)
}

function getLearningIntervalSeconds(correctCount: number) {
  const index = Math.max(0, Math.min(LEARNING_INTERVALS_IN_SECONDS.length - 1, correctCount - 1))
  return LEARNING_INTERVALS_IN_SECONDS[index]
}

function getNextStageAfterCorrect(stats: QuestionStatsRecord, nextCorrectCount: number, nextCorrectStreak: number, nextStability: number) {
  const masteredCandidate = nextCorrectCount >= 10
    && adjustedAccuracy(nextCorrectCount, stats.answerCount + 1) >= 0.9
    && nextStability >= 30

  if (masteredCandidate) {
    return "MASTERED" satisfies QuestionStage
  }

  if (stats.stage === "LAPSE" && nextCorrectStreak >= 2) {
    return "REVIEW" satisfies QuestionStage
  }

  if (stats.stage === "NEW") {
    return "LEARNING" satisfies QuestionStage
  }

  if (stats.stage === "LEARNING" && nextCorrectCount >= 2) {
    return "REVIEW" satisfies QuestionStage
  }

  return stats.stage
}

function getNextStageAfterWrong(stats: QuestionStatsRecord) {
  if (stats.stage === "MASTERED") {
    return "LAPSE" satisfies QuestionStage
  }

  if (stats.stage === "REVIEW") {
    return "LAPSE" satisfies QuestionStage
  }

  return "LEARNING" satisfies QuestionStage
}

export function updateQuestionStatsAfterAnswer({ stats, isCorrect, responseTimeMs, now = new Date() }: UpdateAfterAnswerInput) {
  const answerCount = stats.answerCount + 1
  const correctCount = stats.correctCount + (isCorrect ? 1 : 0)
  const wrongCount = stats.wrongCount + (isCorrect ? 0 : 1)
  const correctStreak = isCorrect ? stats.correctStreak + 1 : 0
  const wrongStreak = isCorrect ? 0 : stats.wrongStreak + 1
  const emaAccuracy = stats.emaAccuracy * (1 - EMA_WEIGHT) + (isCorrect ? EMA_WEIGHT : 0)
  const avgResponseTimeMs = calculateAverageResponseTime(stats.avgResponseTimeMs, responseTimeMs)
  const timeFactor = getTimeFactor(responseTimeMs)

  let stability = stats.stability
  let ease = stats.ease
  let difficulty = stats.difficulty
  let lastIntervalSeconds: number
  let nextDueAt: Date

  if (isCorrect && (stats.stage === "NEW" || stats.stage === "LEARNING")) {
    lastIntervalSeconds = getLearningIntervalSeconds(correctCount)
    nextDueAt = new Date(now.getTime() + lastIntervalSeconds * 1000)
    stability = Math.min(STABILITY_CAP_IN_DAYS, Math.max(stats.stability, lastIntervalSeconds / ONE_DAY_IN_SECONDS))
    difficulty = Math.max(0.1, difficulty - 0.03)
    ease = Math.min(2.3, ease + 0.02)
  } else if (isCorrect) {
    const growth = 1 + Math.min(0.15 + 0.05 * correctStreak, 0.35)
    stability = Math.min(STABILITY_CAP_IN_DAYS, stability * growth * ease * timeFactor)
    difficulty = Math.max(0.1, difficulty - 0.03)
    ease = Math.min(2.3, ease + 0.02)
    lastIntervalSeconds = Math.max(TEN_MINUTES_IN_SECONDS, Math.round(stability * ONE_DAY_IN_SECONDS))
    nextDueAt = new Date(now.getTime() + lastIntervalSeconds * 1000)
  } else {
    stability = Math.max(0.3, stability * 0.5)
    difficulty = Math.min(3, difficulty + 0.08)
    ease = Math.max(1.1, ease - 0.04)
    lastIntervalSeconds = Math.max(TEN_MINUTES_IN_SECONDS, Math.round(stability * 0.3 * ONE_DAY_IN_SECONDS))
    nextDueAt = new Date(now.getTime() + lastIntervalSeconds * 1000)
  }

  const stage = isCorrect
    ? getNextStageAfterCorrect(stats, correctCount, correctStreak, stability)
    : getNextStageAfterWrong(stats)

  return {
    ...stats,
    answerCount,
    correctCount,
    wrongCount,
    correctStreak,
    wrongStreak,
    lastAnsweredAt: now,
    lastCorrectAt: isCorrect ? now : stats.lastCorrectAt,
    lastResult: isCorrect ? "correct" : "wrong",
    stage,
    stability,
    ease,
    difficulty,
    lastIntervalSeconds,
    emaAccuracy,
    avgResponseTimeMs,
    nextDueAt,
    updatedAt: now,
  } satisfies QuestionStatsRecord
}
