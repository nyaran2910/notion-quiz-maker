import type { QuestionSelectionCandidate } from "@/lib/db/types"

const WEIGHTS = {
  due: 0.4,
  weak: 0.2,
  novelty: 0.15,
  retry: 0.1,
  difficulty: 0.15,
  fatigue: 0.25,
} as const

const DEFAULTS = {
  alpha: 2,
  beta: 2,
  cooldownMinutes: 30,
  gamma: 1.2,
  topN: 20,
} as const

export function sigmoid(value: number) {
  return 1 / (1 + Math.exp(-value))
}

export function adjustedAccuracy(correctCount: number, answerCount: number, alpha = DEFAULTS.alpha, beta = DEFAULTS.beta) {
  return (correctCount + alpha) / (answerCount + alpha + beta)
}

export function normalizeDifficulty(value: number, minValue = 0.1, maxValue = 3.0) {
  const clipped = Math.max(minValue, Math.min(maxValue, value))
  return (clipped - minValue) / (maxValue - minValue)
}

export function calculateDueScore(candidate: Pick<QuestionSelectionCandidate, "nextDueAt" | "lastAnsweredAt" | "stability">, now: Date) {
  if (candidate.nextDueAt) {
    const overdueDays = Math.max(0, (now.getTime() - candidate.nextDueAt.getTime()) / 86_400_000)
    return sigmoid(overdueDays / 2)
  }

  if (!candidate.lastAnsweredAt) {
    return 1
  }

  const elapsedDays = (now.getTime() - candidate.lastAnsweredAt.getTime()) / 86_400_000
  const retention = Math.exp(-elapsedDays / Math.max(candidate.stability, 0.1))
  return 1 - retention
}

export function calculateWeakScore(candidate: Pick<QuestionSelectionCandidate, "correctCount" | "answerCount" | "emaAccuracy">) {
  const longTerm = 1 - adjustedAccuracy(candidate.correctCount, candidate.answerCount)
  const shortTerm = 1 - candidate.emaAccuracy
  const raw = 0.6 * shortTerm + 0.4 * longTerm
  const confidence = Math.min(1, candidate.answerCount / 10)
  return confidence * raw + (1 - confidence) * 0.5
}

export function calculateNoveltyScore(candidate: Pick<QuestionSelectionCandidate, "answerCount">) {
  if (candidate.answerCount === 0) {
    return 1
  }

  if (candidate.answerCount < 3) {
    return 0.5
  }

  return 0
}

export function calculateRetryScore(candidate: Pick<QuestionSelectionCandidate, "sessionRetryQueued">) {
  return candidate.sessionRetryQueued ? 0.8 : 0
}

export function calculateDifficultyScore(candidate: Pick<QuestionSelectionCandidate, "difficulty">) {
  return normalizeDifficulty(candidate.difficulty)
}

export function calculateFatiguePenalty(
  candidate: Pick<QuestionSelectionCandidate, "lastAnsweredAt">,
  now: Date,
  cooldownMinutes = DEFAULTS.cooldownMinutes
) {
  if (!candidate.lastAnsweredAt) {
    return 0
  }

  const elapsedMinutes = (now.getTime() - candidate.lastAnsweredAt.getTime()) / 60_000
  return Math.exp(-elapsedMinutes / cooldownMinutes)
}

export function calculateQuestionScore(candidate: QuestionSelectionCandidate, now: Date) {
  const due = calculateDueScore(candidate, now)
  const weak = calculateWeakScore(candidate)
  const novelty = calculateNoveltyScore(candidate)
  const retry = calculateRetryScore(candidate)
  const difficulty = calculateDifficultyScore(candidate)
  const fatigue = calculateFatiguePenalty(candidate, now)

  return Math.max(
    0,
    WEIGHTS.due * due
      + WEIGHTS.weak * weak
      + WEIGHTS.novelty * novelty
      + WEIGHTS.retry * retry
      + WEIGHTS.difficulty * difficulty
      - WEIGHTS.fatigue * fatigue
  )
}

export function getSelectionTuning() {
  return DEFAULTS
}
