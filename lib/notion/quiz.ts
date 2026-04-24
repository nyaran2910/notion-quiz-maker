import { isFullPage } from "@notionhq/client"

import { getNotionClient } from "./client"
import { quizRequirements, type QuizRequirementKey } from "./quiz-schema"
import type { QuizMappings, QuizQuestion, QuizRichTextItem, QuizSourceConfig } from "./quiz-types"

type NotionFile = {
  type: "file" | "external"
  name: string
  file?: {
    url: string
  }
  external?: {
    url: string
  }
}

type NumberPropertyValue = {
  id: string
  type: "number"
  number: number | null
}

type SelectPropertyValue = {
  id: string
  type: "select"
  select: {
    id: string
    name: string
  } | null
}

type TitlePropertyValue = {
  id: string
  type: "title"
  title: QuizRichTextItem[]
}

type RichTextPropertyValue = {
  id: string
  type: "rich_text"
  rich_text: QuizRichTextItem[]
}

type FilesPropertyValue = {
  id: string
  type: "files"
  files: NotionFile[]
}

type NotionPageProperty =
  | NumberPropertyValue
  | SelectPropertyValue
  | TitlePropertyValue
  | RichTextPropertyValue
  | FilesPropertyValue
  | {
      id: string
      type: string
      [key: string]: unknown
    }

type QuizCandidate = {
  questionItemId?: string
  pageId: string
  dataSourceId: string
  dataSourceName: string
  dataSourceUrl?: string | null
  question: QuizRichTextItem[]
  answer: QuizRichTextItem[]
  answerText: string
  explanation: QuizRichTextItem[]
  imageUrls: string[]
  askedCount: number
  accuracy: number
  priority: string | null
  score: number
}

function getPropertyById(properties: Record<string, unknown>, propertyId: string): NotionPageProperty | null {
  for (const value of Object.values(properties)) {
    if (
      value &&
      typeof value === "object" &&
      "id" in value &&
      typeof value.id === "string" &&
      value.id === propertyId &&
      "type" in value &&
      typeof value.type === "string"
    ) {
      return value as NotionPageProperty
    }
  }

  return null
}

function getPlainText(items: QuizRichTextItem[] = []) {
  return items
    .map((item) => {
      if (item.type === "equation") {
        return item.equation?.expression ?? ""
      }

      return item.plain_text ?? item.text?.content ?? ""
    })
    .join("")
    .trim()
}

function getRichTextValue(property: NotionPageProperty | null): QuizRichTextItem[] {
  if (!property) {
    return []
  }

  if (property.type === "title") {
    return property.title as QuizRichTextItem[]
  }

  if (property.type === "rich_text") {
    return property.rich_text as QuizRichTextItem[]
  }

  return []
}

function getImageUrls(property: NotionPageProperty | null): string[] {
  if (!property || property.type !== "files" || !Array.isArray(property.files)) {
    return []
  }

  return property.files
    .map((file) => file.type === "file" ? file.file?.url : file.external?.url)
    .filter((url): url is string => typeof url === "string" && url.length > 0)
}

function getPriorityWeight(priority: string | null) {
  const normalized = priority?.trim().toUpperCase()

  switch (normalized) {
    case "HIGH":
      return 1
    case "MID":
    case "MEDIUM":
    case "MIDDLE":
      return 0.58
    case "LOW":
      return 0.18
    default:
      return 0.58
  }
}

function getCandidateScore(accuracy: number, askedCount: number, priority: string | null) {
  const normalizedAccuracy = Math.min(Math.max(accuracy, 0), 1)
  const difficultyWeight = 1 - normalizedAccuracy
  const freshnessWeight = 1 / Math.sqrt(Math.max(askedCount, 0) + 1)
  const priorityWeight = getPriorityWeight(priority)

  return 0.45 * priorityWeight + 0.35 * difficultyWeight + 0.2 * freshnessWeight
}

function pickWeightedCandidates(candidates: QuizCandidate[], count: number) {
  const pool = [...candidates]
  const selected: QuizCandidate[] = []

  while (pool.length > 0 && selected.length < count) {
    const totalWeight = pool.reduce((sum, candidate) => sum + Math.max(candidate.score, 0.01), 0)
    let threshold = Math.random() * totalWeight
    let chosenIndex = 0

    for (let index = 0; index < pool.length; index += 1) {
      threshold -= Math.max(pool[index].score, 0.01)

      if (threshold <= 0) {
        chosenIndex = index
        break
      }
    }

    selected.push(pool[chosenIndex])
    pool.splice(chosenIndex, 1)
  }

  return selected
}

function buildQuestion(candidate: QuizCandidate): QuizQuestion {
  return {
    id: candidate.questionItemId ?? candidate.pageId,
    questionItemId: candidate.questionItemId ?? candidate.pageId,
    pageId: candidate.pageId,
    dataSourceId: candidate.dataSourceId,
    dataSourceName: candidate.dataSourceName,
    prompt: candidate.question,
    correctAnswer: candidate.answer,
    explanation: candidate.explanation,
    imageUrls: candidate.imageUrls,
  }
}

function validateMappings(mappings: Partial<Record<QuizRequirementKey, string>>) {
  const requiredKeys = quizRequirements.filter((requirement) => requirement.required).map((requirement) => requirement.key)

  for (const key of requiredKeys) {
    if (!mappings[key]) {
      throw new Error(`Missing mapping for ${key}`)
    }
  }

  return mappings as QuizMappings & { question: string, answer: string }
}

export async function loadCandidatesForSource(source: QuizSourceConfig) {
  const notion = await getNotionClient()

  if (!notion) {
    throw new Error("Notion session is not connected")
  }

  const mappings = validateMappings(source.mappings)
  const pages = []
  let startCursor: string | undefined

  do {
    const response = await notion.dataSources.query({
      data_source_id: source.dataSourceId,
      result_type: "page",
      page_size: 100,
      start_cursor: startCursor,
    })

    pages.push(...response.results.filter(isFullPage))
    startCursor = response.has_more ? (response.next_cursor ?? undefined) : undefined
  } while (startCursor)

  return pages
    .map<QuizCandidate | null>((page) => {
      const question = getRichTextValue(getPropertyById(page.properties, mappings.question))
      const answer = getRichTextValue(getPropertyById(page.properties, mappings.answer))
      const answerText = getPlainText(answer)

      if (question.length === 0 || answer.length === 0 || answerText.length === 0) {
        return null
      }

      const accuracy = 0
      const askedCount = 0
      const priority = null

        return {
        pageId: page.id,
        dataSourceId: source.dataSourceId,
        dataSourceName: source.dataSourceName,
        dataSourceUrl: source.dataSourceUrl ?? null,
        question,
        answer,
        answerText,
          explanation: mappings.explanation ? getRichTextValue(getPropertyById(page.properties, mappings.explanation)) : [],
        imageUrls: mappings.image ? getImageUrls(getPropertyById(page.properties, mappings.image)) : [],
        accuracy,
        askedCount,
        priority,
        score: getCandidateScore(accuracy, askedCount, priority),
      }
    })
    .filter((candidate): candidate is QuizCandidate => Boolean(candidate))
}

export async function loadQuestionImageUrls(pageId: string, imagePropertyId: string) {
  const notion = await getNotionClient()

  if (!notion) {
    throw new Error("Notion session is not connected")
  }

  const page = await notion.pages.retrieve({ page_id: pageId })

  if (!isFullPage(page)) {
    return []
  }

  return getImageUrls(getPropertyById(page.properties, imagePropertyId))
}

export async function loadQuizCandidates(sources: QuizSourceConfig[]) {
  const validatedSources = sources.filter((source) => {
    try {
      validateMappings(source.mappings)
      return true
    } catch {
      return false
    }
  })

  if (validatedSources.length === 0) {
    throw new Error("No fully configured data source was provided")
  }

  const candidateGroups = await Promise.all(validatedSources.map((source) => loadCandidatesForSource(source)))

  return {
    validatedSources,
    sourceCount: validatedSources.length,
    candidates: candidateGroups.flat(),
  }
}

export async function startQuiz(
  sources: QuizSourceConfig[],
  questionCount: number
) {
  const { sourceCount, candidates } = await loadQuizCandidates(sources)

  if (candidates.length === 0) {
    throw new Error("出題できる候補がありません")
  }

  const selectedCandidates = pickWeightedCandidates(candidates, Math.max(1, Math.min(questionCount, candidates.length)))

  const questions = selectedCandidates.map((candidate) => buildQuestion(candidate))

  return {
    totalCandidates: candidates.length,
    sourceCount,
    questions,
  }
}

export async function recordQuizAnswer(
  pageId: string,
  rawMappings: Partial<Record<QuizRequirementKey, string>>,
  isCorrect: boolean
) {
  const notion = await getNotionClient()

  if (!notion) {
    throw new Error("Notion session is not connected")
  }

  validateMappings(rawMappings)

  return {
    askedCount: 0,
    accuracy: isCorrect ? 1 : 0,
  }
}
