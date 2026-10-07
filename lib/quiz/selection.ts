import type { QuestionSelectionCandidate } from "@/lib/db/types"
import { calculateQuestionScore, getSelectionTuning } from "@/lib/quiz/scoring"
import { getRecentHistoryLimit, shouldSuppressCategory } from "@/lib/quiz/session"

export type SelectionContext = {
  now?: Date
  recentQuestionIds?: string[]
  lastCategory?: string | null
}

export type ScoredCandidate = {
  candidate: QuestionSelectionCandidate
  score: number
}

function weightedRandomChoice(candidates: ScoredCandidate[], gamma: number, minimumWeight: number) {
  const weighted = candidates.map((entry) => ({
    ...entry,
    weight: Math.max(entry.score, 0) ** gamma + minimumWeight,
  }))
  const total = weighted.reduce((sum, entry) => sum + entry.weight, 0)

  if (total <= 0) {
    return weighted[weighted.length - 1] ?? null
  }

  let threshold = Math.random() * total

  for (const entry of weighted) {
    threshold -= entry.weight

    if (threshold <= 0) {
      return entry
    }
  }

  return weighted[weighted.length - 1] ?? null
}

function scoreCandidate(candidate: QuestionSelectionCandidate, now: Date, lastCategory: string | null) {
  const baseScore = calculateQuestionScore(candidate, now)

  if (!shouldSuppressCategory(candidate.category, lastCategory)) {
    return baseScore
  }

  return baseScore * 0.85
}

export function selectNextQuestion(candidates: QuestionSelectionCandidate[], context: SelectionContext = {}) {
  const now = context.now ?? new Date()
  const recentQuestionIds = context.recentQuestionIds ?? []
  const recentExclusion = new Set(recentQuestionIds.slice(-getRecentHistoryLimit()))
  const activeCandidates = candidates.filter((candidate) => !candidate.suspended)
  const unseenRecently = activeCandidates.filter((candidate) => !recentExclusion.has(candidate.questionItemId))
  const pool = unseenRecently.length > 0 ? unseenRecently : activeCandidates
  const tuning = getSelectionTuning()

  const scored = pool
    .map((candidate) => ({
      candidate,
      score: scoreCandidate(candidate, now, context.lastCategory ?? null),
    }))
    .sort((left, right) => right.score - left.score)

  if (scored.length === 0) {
    return null
  }

  const selected = weightedRandomChoice(scored, tuning.gamma, tuning.minimumWeight)

  if (!selected) {
    return null
  }

  return {
    selected: selected.candidate,
    scored,
  }
}
