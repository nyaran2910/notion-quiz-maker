import { isFullPage } from "@notionhq/client"

import { getNotionClient } from "./client"
import type { QuizRequirementKey } from "./quiz-schema"
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
  pageId: string
  dataSourceId: string
  dataSourceName: string
  question: QuizRichTextItem[]
  answer: QuizRichTextItem[]
  answerText: string
  explanation: QuizRichTextItem[]
  imageUrl: string | null
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

function getNumberValue(property: NotionPageProperty | null) {
  if (!property || property.type !== "number" || typeof property.number !== "number") {
    return 0
  }

  return property.number
}

function getSelectValue(property: NotionPageProperty | null) {
  if (!property || property.type !== "select") {
    return null
  }

  if (property.select && typeof property.select === "object" && "name" in property.select) {
    return typeof property.select.name === "string" ? property.select.name : null
  }

  return null
}

function getImageUrl(property: NotionPageProperty | null): string | null {
  if (!property || property.type !== "files" || !Array.isArray(property.files)) {
    return null
  }

  const file = property.files[0]

  if (!file) {
    return null
  }

  return file.type === "file" ? (file.file?.url ?? null) : (file.external?.url ?? null)
}

function getPriorityWeight(priority: string | null) {
  switch (priority) {
    case "High":
      return 1
    case "Medium":
      return 0.6
    case "Low":
      return 0.2
    default:
      return 0.4
  }
}

function getCandidateScore(accuracy: number, askedCount: number, priority: string | null) {
  const difficultyWeight = 1 - Math.min(Math.max(accuracy, 0), 1)
  const freshnessWeight = 1 / (askedCount + 1)
  const priorityWeight = getPriorityWeight(priority)

  return 0.5 * difficultyWeight + 0.3 * freshnessWeight + 0.2 * priorityWeight
}

function shuffleArray<T>(items: T[]) {
  const next = [...items]

  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1))
    ;[next[index], next[swapIndex]] = [next[swapIndex], next[index]]
  }

  return next
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

function buildQuestion(candidate: QuizCandidate, candidates: QuizCandidate[]): QuizQuestion | null {
  const distractors = shuffleArray(
    candidates.filter(
      (item) => item.pageId !== candidate.pageId && item.answerText !== candidate.answerText && item.answerText.length > 0
    )
  ).slice(0, 3)

  if (distractors.length < 3) {
    return null
  }

  const options = shuffleArray([
    {
      id: `${candidate.pageId}-correct`,
      pageId: candidate.pageId,
      answer: candidate.answer,
    },
    ...distractors.map((item) => ({
      id: `${item.pageId}-option`,
      pageId: item.pageId,
      answer: item.answer,
    })),
  ])

  return {
    id: candidate.pageId,
    pageId: candidate.pageId,
    dataSourceId: candidate.dataSourceId,
    dataSourceName: candidate.dataSourceName,
    prompt: candidate.question,
    correctAnswer: candidate.answer,
    explanation: candidate.explanation,
    imageUrl: candidate.imageUrl,
    options,
  }
}

function validateMappings(mappings: Partial<Record<QuizRequirementKey, string>>): Required<QuizMappings> {
  const requiredKeys: QuizRequirementKey[] = [
    "accuracy",
    "askedCount",
    "question",
    "answer",
    "explanation",
    "image",
    "priority",
  ]

  for (const key of requiredKeys) {
    if (!mappings[key]) {
      throw new Error(`Missing mapping for ${key}`)
    }
  }

  return mappings as Required<QuizMappings>
}

async function loadCandidatesForSource(source: QuizSourceConfig) {
  const notion = await getNotionClient()

  if (!notion) {
    throw new Error("Notion session is not connected")
  }

  const mappings = validateMappings(source.mappings)
  const response = await notion.dataSources.query({
    data_source_id: source.dataSourceId,
    result_type: "page",
    page_size: 100,
  })

  const pages = response.results.filter(isFullPage)
  return pages
    .map<QuizCandidate | null>((page) => {
      const question = getRichTextValue(getPropertyById(page.properties, mappings.question))
      const answer = getRichTextValue(getPropertyById(page.properties, mappings.answer))
      const answerText = getPlainText(answer)

      if (question.length === 0 || answer.length === 0 || answerText.length === 0) {
        return null
      }

      const accuracy = getNumberValue(getPropertyById(page.properties, mappings.accuracy))
      const askedCount = getNumberValue(getPropertyById(page.properties, mappings.askedCount))
      const priority = getSelectValue(getPropertyById(page.properties, mappings.priority))

      return {
        pageId: page.id,
        dataSourceId: source.dataSourceId,
        dataSourceName: source.dataSourceName,
        question,
        answer,
        answerText,
        explanation: getRichTextValue(getPropertyById(page.properties, mappings.explanation)),
        imageUrl: getImageUrl(getPropertyById(page.properties, mappings.image)),
        accuracy,
        askedCount,
        priority,
        score: getCandidateScore(accuracy, askedCount, priority),
      }
    })
    .filter((candidate): candidate is QuizCandidate => Boolean(candidate))
}

export async function startQuiz(
  sources: QuizSourceConfig[],
  questionCount: number
) {
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
  const candidates = candidateGroups.flat()

  const viableCandidates = candidates.filter((candidate) => {
    const distractorCount = candidates.filter(
      (item) => item.pageId !== candidate.pageId && item.answerText !== candidate.answerText && item.answerText.length > 0
    ).length

    return distractorCount >= 3
  })

  if (viableCandidates.length === 0) {
    throw new Error("4択を作れるだけの回答候補がありません")
  }

  const selectedCandidates = pickWeightedCandidates(
    viableCandidates,
    Math.max(1, Math.min(questionCount, viableCandidates.length))
  )

  const questions = selectedCandidates
    .map((candidate) => buildQuestion(candidate, viableCandidates))
    .filter((question): question is QuizQuestion => Boolean(question))

  return {
    totalCandidates: viableCandidates.length,
    sourceCount: validatedSources.length,
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

  const mappings = validateMappings(rawMappings)
  const page = await notion.pages.retrieve({
    page_id: pageId,
  })

  if (!("properties" in page)) {
    throw new Error(`Could not load page: ${pageId}`)
  }

  const accuracyProperty = getPropertyById(page.properties as Record<string, unknown>, mappings.accuracy)
  const askedCountProperty = getPropertyById(page.properties as Record<string, unknown>, mappings.askedCount)
  const askedCount = getNumberValue(askedCountProperty)
  const accuracy = getNumberValue(accuracyProperty)
  const nextAskedCount = askedCount + 1
  const nextAccuracy = ((accuracy * askedCount) + (isCorrect ? 1 : 0)) / nextAskedCount

  await notion.pages.update({
    page_id: pageId,
    properties: {
      [mappings.askedCount]: {
        type: "number",
        number: nextAskedCount,
      },
      [mappings.accuracy]: {
        type: "number",
        number: nextAccuracy,
      },
    },
  })

  return {
    askedCount: nextAskedCount,
    accuracy: nextAccuracy,
  }
}
