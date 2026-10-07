export const QUESTION_STAGES = ["NEW", "LEARNING", "REVIEW", "MASTERED", "LAPSE"] as const

export const ANSWER_RESULTS = ["correct", "wrong"] as const

export type QuestionStage = (typeof QUESTION_STAGES)[number]
export type AnswerResult = (typeof ANSWER_RESULTS)[number]

export type QuestionStatsRecord = {
  questionItemId: string
  answerCount: number
  correctCount: number
  wrongCount: number
  correctStreak: number
  wrongStreak: number
  lastAnsweredAt: Date | null
  lastCorrectAt: Date | null
  lastResult: AnswerResult | null
  stage: QuestionStage
  suspended: boolean
  stability: number
  ease: number
  difficulty: number
  lastIntervalSeconds: number | null
  emaAccuracy: number
  avgResponseTimeMs: number | null
  nextDueAt: Date | null
  updatedAt: Date
}

export type QuestionSelectionCandidate = QuestionStatsRecord & {
  questionItemId: string
  category: string | null
  sessionRetryQueued: boolean
}

export type QuizQuestionContent = {
  pageId: string
  prompt: unknown[]
  correctAnswer: unknown[]
  explanation: unknown[]
  imageUrls?: string[]
  imageUrl?: string | null
  dataSourceId: string
  dataSourceName: string
}

export type QuizSessionRecord = {
  id: string
  userId: string
  quizSetId: string
  startedAt: Date
  endedAt: Date | null
  questionCount: number
  correctCount: number
  mode: string | null
  recentQuestionIds: string[]
  lastCategory: string | null
}

export type QuizSessionRetryRecord = {
  id: string
  quizSessionId: string
  questionItemId: string
  availableAfterPosition: number
  consumedAt: Date | null
  createdAt: Date
}

export type AnswerEventInsert = {
  userId: string
  questionItemId: string
  quizSessionId: string | null
  quizSetId: string | null
  answeredAt: Date
  isCorrect: boolean
  responseMs: number | null
  scheduledAfterQuestions: number | null
  retryEnqueued: boolean
  stageBefore: QuestionStage | null
  stageAfter: QuestionStage | null
  answerPayload: Record<string, unknown> | null
}
