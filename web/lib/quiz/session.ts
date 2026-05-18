import type { QuizSessionRecord } from "@/lib/db/types"

const RECENT_HISTORY_LIMIT = 5
const RETRY_MIN_OFFSET = 3
const RETRY_MAX_OFFSET = 8

export function appendRecentQuestionIds(recentQuestionIds: string[], nextQuestionId: string, limit = RECENT_HISTORY_LIMIT) {
  const next = [...recentQuestionIds.filter((questionId) => questionId !== nextQuestionId), nextQuestionId]
  return next.slice(-limit)
}

export function buildSessionProgressPatch(
  session: Pick<QuizSessionRecord, "questionCount" | "correctCount" | "recentQuestionIds" | "lastCategory">,
  questionItemId: string,
  isCorrect: boolean,
  category: string | null
) {
  return {
    questionCount: session.questionCount + 1,
    correctCount: session.correctCount + (isCorrect ? 1 : 0),
    recentQuestionIds: appendRecentQuestionIds(session.recentQuestionIds, questionItemId),
    lastCategory: category,
  }
}

export function calculateRetryOffset(randomValue = Math.random()) {
  const span = RETRY_MAX_OFFSET - RETRY_MIN_OFFSET + 1
  return RETRY_MIN_OFFSET + Math.floor(Math.max(0, Math.min(0.999999, randomValue)) * span)
}

export function calculateRetryAvailabilityPosition(currentQuestionPosition: number, randomValue = Math.random()) {
  return currentQuestionPosition + calculateRetryOffset(randomValue)
}

export function shouldSuppressCategory(candidateCategory: string | null, lastCategory: string | null) {
  return Boolean(candidateCategory && lastCategory && candidateCategory === lastCategory)
}

export function getRecentHistoryLimit() {
  return RECENT_HISTORY_LIMIT
}
