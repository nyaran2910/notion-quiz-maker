import type { QuizRequirementKey } from "./quiz-schema"

export type QuizMappings = Partial<Record<QuizRequirementKey, string>>

export type QuizRichTextItem = {
  plain_text?: string
  type?: string
  text?: {
    content?: string
  }
  equation?: {
    expression?: string
  }
}

export type QuizQuestion = {
  id: string
  questionItemId: string
  pageId: string
  dataSourceId: string
  dataSourceName: string
  prompt: QuizRichTextItem[]
  correctAnswer: QuizRichTextItem[]
  explanation: QuizRichTextItem[]
  imageUrls: string[]
}

export type QuizSourceConfig = {
  dataSourceId: string
  dataSourceName: string
  dataSourceUrl?: string
  mappings: QuizMappings
}
