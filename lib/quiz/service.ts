import { encryptString } from "@/lib/crypto"
import { requireCurrentUser } from "@/lib/auth/user"
import { withTransaction } from "@/lib/db/client"
import { answerEventsRepository } from "@/lib/db/repositories/answer-events"
import { notionConnectionsRepository } from "@/lib/db/repositories/notion-connections"
import { notionDataSourcesRepository } from "@/lib/db/repositories/notion-data-sources"
import { questionItemsRepository } from "@/lib/db/repositories/question-items"
import { questionStatsRepository } from "@/lib/db/repositories/question-stats"
import { quizSessionCandidatesRepository } from "@/lib/db/repositories/quiz-session-candidates"
import { quizSessionRetriesRepository } from "@/lib/db/repositories/quiz-session-retries"
import { quizSessionsRepository } from "@/lib/db/repositories/quiz-sessions"
import { quizSetsRepository } from "@/lib/db/repositories/quiz-sets"
import type { QuestionSelectionCandidate, QuizQuestionContent } from "@/lib/db/types"
import { getNotionClient, getNotionTokenFromSession } from "@/lib/notion/client"
import { getSessionProfile } from "@/lib/notion/api"
import {
  loadQuestionImageUrls,
  loadQuizCandidates,
  recordQuizAnswer as recordQuizAnswerInNotion,
  startQuiz as startQuizInNotion,
} from "@/lib/notion/quiz"
import type { QuizQuestion, QuizSourceConfig } from "@/lib/notion/quiz-types"
import { getServerEnv } from "@/lib/server-env"
import { selectNextQuestion } from "@/lib/quiz/selection"
import { buildSessionProgressPatch, calculateRetryAvailabilityPosition } from "@/lib/quiz/session"
import { updateQuestionStatsAfterAnswer } from "@/lib/quiz/updater"

type StartedQuizSession = {
  sessionId: string | null
  quizSetId: string | null
  plannedQuestionCount: number
  totalCandidates: number
  sourceCount: number
  questions: QuizQuestion[]
}

type PersistedSource = {
  notionDataSourceId: string
  dataSourceId: string
  mappings: QuizSourceConfig["mappings"]
}

type SyncedQuizSourcesResult = {
  sourceCount: number
  questionCount: number
}

type StartSessionCandidate = {
  selection: QuestionSelectionCandidate
  question: QuizQuestion
  retryId?: string | null
  mappings?: QuizSourceConfig["mappings"]
}

type RecordAnswerInput = {
  pageId?: string
  questionItemId?: string
  sessionId?: string
  isCorrect: boolean
  questionPosition?: number
  responseTimeMs?: number | null
  mappings?: QuizSourceConfig["mappings"]
}

function isDatabaseEnabled() {
  return Boolean(getServerEnv().databaseUrl)
}

function assertNotionClient<T>(value: T | null): T {
  if (!value) {
    throw new Error("Notion session is not connected")
  }

  return value
}

function buildContentCacheFromCandidate(candidate: {
  pageId: string
  question: QuizQuestion["prompt"]
  answer: QuizQuestion["correctAnswer"]
  explanation: QuizQuestion["explanation"]
  imageUrls: string[]
  dataSourceId: string
  dataSourceName: string
}) {
  return {
    pageId: candidate.pageId,
    prompt: candidate.question,
    correctAnswer: candidate.answer,
    explanation: candidate.explanation,
    imageUrls: candidate.imageUrls,
    dataSourceId: candidate.dataSourceId,
    dataSourceName: candidate.dataSourceName,
  }
}

function getContentImageUrls(content: QuizQuestionContent) {
  if (Array.isArray(content.imageUrls)) {
    return content.imageUrls.filter((url): url is string => typeof url === "string" && url.length > 0)
  }

  return typeof content.imageUrl === "string" && content.imageUrl.length > 0 ? [content.imageUrl] : []
}

function buildQuizQuestion(questionItemId: string, question: Omit<QuizQuestion, "questionItemId" | "id">): QuizQuestion {
  return {
    id: questionItemId,
    questionItemId,
    ...question,
  }
}

function toQuizQuestion(questionItemId: string, content: QuizQuestionContent): QuizQuestion {
  return {
    id: questionItemId,
    questionItemId,
    pageId: content.pageId,
    dataSourceId: content.dataSourceId,
    dataSourceName: content.dataSourceName,
    prompt: content.prompt as QuizQuestion["prompt"],
    correctAnswer: content.correctAnswer as QuizQuestion["correctAnswer"],
    explanation: content.explanation as QuizQuestion["explanation"],
    imageUrls: getContentImageUrls(content),
  }
}

function selectQuestions(candidates: StartSessionCandidate[], questionCount: number) {
  const selected: QuizQuestion[] = []
  const remaining = [...candidates]
  let recentQuestionIds: string[] = []
  let lastCategory: string | null = null

  while (selected.length < questionCount && remaining.length > 0) {
    const next = selectNextQuestion(
      remaining.map((entry) => entry.selection),
      { recentQuestionIds, lastCategory }
    )

    if (!next) {
      break
    }

    const chosenIndex = remaining.findIndex((entry) => entry.selection.questionItemId === next.selected.questionItemId)

    if (chosenIndex < 0) {
      break
    }

    const chosen = remaining.splice(chosenIndex, 1)[0]
    selected.push(chosen.question)
    recentQuestionIds = [...recentQuestionIds, chosen.selection.questionItemId]
    lastCategory = chosen.selection.category
  }

  return selected
}

function selectSingleQuestion(candidates: StartSessionCandidate[], session: { recentQuestionIds: string[], lastCategory: string | null }) {
  const next = selectNextQuestion(
    candidates.map((entry) => entry.selection),
    {
      recentQuestionIds: session.recentQuestionIds,
      lastCategory: session.lastCategory,
    }
  )

  if (!next) {
    return null
  }

  return candidates.find((entry) => entry.selection.questionItemId === next.selected.questionItemId) ?? null
}

async function loadPersistenceContext() {
  const user = await requireCurrentUser()
  assertNotionClient(await getNotionClient())

  const token = await getNotionTokenFromSession()

  if (!token) {
    throw new Error("Notion session is not connected")
  }

  const profile = await getSessionProfile()

  if (!profile) {
    throw new Error("Notion session is not connected")
  }

  return {
    user,
    token,
    profile,
  }
}

async function refreshQuestionImage(question: QuizQuestion, mappings: QuizSourceConfig["mappings"]) {
  if (!mappings.image) {
    return question
  }

  return {
    ...question,
    imageUrls: await loadQuestionImageUrls(question.pageId, mappings.image),
  }
}

async function persistCandidates(sources: QuizSourceConfig[]) {
  const { user, token, profile } = await loadPersistenceContext()
  const { validatedSources, candidates, sourceCount } = await loadQuizCandidates(sources)

  return withTransaction(async (client) => {
    const notionConnection = await notionConnectionsRepository.upsert(client, {
      userId: user.id,
      workspaceId: profile.workspaceId,
      workspaceName: profile.workspaceName,
      workspaceIconUrl: null,
      encryptedAccessToken: encryptString(token),
    })

    const byDataSource = new Map<string, Awaited<ReturnType<typeof notionDataSourcesRepository.upsert>>>()
    const pageIdsByDataSource = new Map<string, Set<string>>()
    const persistedCandidates: StartSessionCandidate[] = []

    for (const source of sources) {
      const dataSource = await notionDataSourcesRepository.upsert(client, {
        notionConnectionId: notionConnection.id,
        dataSourceId: source.dataSourceId,
        name: source.dataSourceName,
        url: source.dataSourceUrl ?? null,
      })

      byDataSource.set(source.dataSourceId, dataSource)
      pageIdsByDataSource.set(source.dataSourceId, new Set())
    }

    for (const candidate of candidates) {
      const dataSource = byDataSource.get(candidate.dataSourceId)

      if (!dataSource) {
        continue
      }

      pageIdsByDataSource.get(candidate.dataSourceId)?.add(candidate.pageId)

      const question = buildQuizQuestion("", {
        pageId: candidate.pageId,
        dataSourceId: candidate.dataSourceId,
        dataSourceName: candidate.dataSourceName,
        prompt: candidate.question,
        correctAnswer: candidate.answer,
        explanation: candidate.explanation,
        imageUrls: candidate.imageUrls,
      })

      const questionItem = await questionItemsRepository.upsert(client, {
        userId: user.id,
        notionDataSourceId: dataSource.id,
        pageId: candidate.pageId,
        category: null,
        contentCache: buildContentCacheFromCandidate(candidate),
      })
      const stats = await questionStatsRepository.createIfMissing(client, questionItem.id)

      persistedCandidates.push({
        selection: {
          ...stats,
          questionItemId: questionItem.id,
          category: questionItem.category,
          sessionRetryQueued: false,
        },
        question: {
          ...question,
          id: questionItem.id,
          questionItemId: questionItem.id,
        },
      })
    }

    for (const source of validatedSources) {
      const dataSource = byDataSource.get(source.dataSourceId)

      if (!dataSource) {
        continue
      }

      await questionItemsRepository.deleteMissingForDataSource(client, {
        userId: user.id,
        notionDataSourceId: dataSource.id,
        pageIds: [...(pageIdsByDataSource.get(source.dataSourceId) ?? new Set<string>())],
      })
    }

    return {
      userId: user.id,
      sourceCount,
      persistedCandidates,
      persistedSources: sources
        .map((source) => {
          const dataSource = byDataSource.get(source.dataSourceId)

          if (!dataSource) {
            return null
          }

          return {
            notionDataSourceId: dataSource.id,
            dataSourceId: source.dataSourceId,
            mappings: source.mappings,
          } satisfies PersistedSource
        })
        .filter((source): source is PersistedSource => Boolean(source)),
    }
  })
}

export async function startQuizSession(sources: QuizSourceConfig[], questionCount: number): Promise<StartedQuizSession> {
  if (!isDatabaseEnabled()) {
    const fallbackQuiz = await startQuizInNotion(sources, questionCount)

    return {
      sessionId: null,
      quizSetId: null,
      plannedQuestionCount: fallbackQuiz.questions.length,
      ...fallbackQuiz,
    }
  }

  const persisted = await persistCandidates(sources)

  if (persisted.persistedCandidates.length === 0) {
    throw new Error("出題できる候補がありません")
  }

  const selectedQuestionCount = Math.max(1, Math.min(questionCount, persisted.persistedCandidates.length))

  return withTransaction(async (client) => {
    const quizSetId = await quizSetsRepository.create(
      client,
      persisted.userId,
      `Ad hoc quiz ${new Date().toISOString()}`,
      `Generated from ${persisted.sourceCount} selected source(s)`,
      { isTemporary: true }
    )

    await quizSetsRepository.replaceSources(
      client,
      quizSetId,
      persisted.persistedSources.map((source) => ({
        notionDataSourceId: source.notionDataSourceId,
        mappings: source.mappings,
      }))
    )

    const sessionId = await quizSetsRepository.createSession(client, {
      userId: persisted.userId,
      quizSetId,
      mode: "flashcard",
    })

    const sourceMappings = new Map(persisted.persistedSources.map((source) => [source.dataSourceId, source.mappings]))
    const selectedQuestions = await Promise.all(
      selectQuestions(persisted.persistedCandidates, 1).map((question) =>
        refreshQuestionImage(question, sourceMappings.get(question.dataSourceId) ?? {})
      )
    )

    return {
      sessionId,
      quizSetId,
      plannedQuestionCount: selectedQuestionCount,
      totalCandidates: persisted.persistedCandidates.length,
      sourceCount: persisted.sourceCount,
      questions: selectedQuestions,
    }
  })
}

export async function syncQuizSources(sources: QuizSourceConfig[]): Promise<SyncedQuizSourcesResult> {
  if (!isDatabaseEnabled()) {
    const { candidates, sourceCount } = await loadQuizCandidates(sources)

    return {
      sourceCount,
      questionCount: candidates.length,
    }
  }

  const persisted = await persistCandidates(sources)

  return {
    sourceCount: persisted.sourceCount,
    questionCount: persisted.persistedCandidates.length,
  }
}

export async function resetQuizSourceMetadata(dataSourceId: string) {
  if (!isDatabaseEnabled()) {
    throw new Error("Database persistence is not enabled")
  }

  const user = await requireCurrentUser()

  return withTransaction(async (client) => {
    const deletedQuestionCount = await questionItemsRepository.deleteForUserDataSource(client, user.id, dataSourceId)

    return {
      deletedQuestionCount,
    }
  })
}

export async function getNextQuizQuestion(sessionId: string) {
  if (!isDatabaseEnabled()) {
    return null
  }

  return withTransaction(async (client) => {
    const session = await quizSessionsRepository.findById(client, sessionId)

    if (!session) {
      throw new Error("Quiz session not found")
    }

    const candidates = await quizSessionCandidatesRepository.listForSession(client, sessionId, session.questionCount)
    const hydrated = candidates
      .filter((candidate) => candidate.content)
      .map((candidate) => ({
        selection: candidate.selection,
        question: toQuizQuestion(candidate.selection.questionItemId, candidate.content as QuizQuestionContent),
        retryId: candidate.retryId,
        mappings: candidate.mappings,
      }))

    const selected = selectSingleQuestion(hydrated, session)

    if (!selected) {
      return null
    }

    if (selected.retryId) {
      await quizSessionRetriesRepository.consume(client, selected.retryId, new Date())
    }

    return refreshQuestionImage(selected.question, selected.mappings ?? {})
  })
}

export async function endQuizSession(sessionId: string) {
  if (!isDatabaseEnabled()) {
    return null
  }

  return withTransaction(async (client) => {
    const session = await quizSessionsRepository.findById(client, sessionId)

    if (!session) {
      throw new Error("Quiz session not found")
    }

    return quizSessionsRepository.endSession(client, sessionId, new Date())
  })
}

export async function recordQuizAnswer(input: RecordAnswerInput) {
  if (!isDatabaseEnabled()) {
    if (!input.pageId || !input.mappings) {
      throw new Error("Missing answer payload")
    }

    return recordQuizAnswerInNotion(input.pageId, input.mappings, input.isCorrect)
  }

  if (!input.questionItemId || !input.sessionId) {
    throw new Error("Missing answer payload")
  }

  const sessionId = input.sessionId
  const questionItemId = input.questionItemId

  return withTransaction(async (client) => {
    const session = await quizSessionsRepository.findById(client, sessionId)

    if (!session) {
      throw new Error("Quiz session not found")
    }

    const questionItem = await questionItemsRepository.findById(client, questionItemId)

    if (!questionItem) {
      throw new Error("Question item not found")
    }

    const currentStats = (await questionStatsRepository.findByQuestionItemId(client, questionItemId))
      ?? (await questionStatsRepository.createIfMissing(client, questionItemId))
    const nextStats = updateQuestionStatsAfterAnswer({
      stats: currentStats,
      isCorrect: input.isCorrect,
      responseTimeMs: input.responseTimeMs,
    })
    const savedStats = await questionStatsRepository.save(client, nextStats)
    const progress = buildSessionProgressPatch(session, questionItemId, input.isCorrect, questionItem.category)
    await quizSessionsRepository.updateProgress(client, sessionId, progress)

    let scheduledAfterQuestions: number | null = null
    let retryEnqueued = false

    if (!input.isCorrect) {
      scheduledAfterQuestions = calculateRetryAvailabilityPosition(input.questionPosition ?? (session.questionCount + 1))
      await quizSessionRetriesRepository.enqueue(client, sessionId, questionItemId, scheduledAfterQuestions)
      retryEnqueued = true
    }

    await answerEventsRepository.insert(client, {
      userId: session.userId,
      questionItemId: questionItemId,
      quizSessionId: sessionId,
      quizSetId: session.quizSetId,
      answeredAt: new Date(),
      isCorrect: input.isCorrect,
      responseMs: input.responseTimeMs ?? null,
      scheduledAfterQuestions,
      retryEnqueued,
      stageBefore: currentStats.stage,
      stageAfter: savedStats.stage,
      answerPayload: input.pageId ? { pageId: input.pageId } : null,
    })

    return {
      askedCount: savedStats.answerCount,
      accuracy: savedStats.answerCount > 0 ? savedStats.correctCount / savedStats.answerCount : 0,
      stage: savedStats.stage,
      nextDueAt: savedStats.nextDueAt,
    }
  })
}
