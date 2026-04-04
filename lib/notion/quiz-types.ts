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

export type QuizOption = {
  id: string
  pageId: string
  answer: QuizRichTextItem[]
}

export type QuizQuestion = {
  id: string
  pageId: string
  dataSourceId: string
  dataSourceName: string
  prompt: QuizRichTextItem[]
  correctAnswer: QuizRichTextItem[]
  explanation: QuizRichTextItem[]
  imageUrl: string | null
  options: QuizOption[]
}

export type QuizSourceConfig = {
  dataSourceId: string
  dataSourceName: string
  mappings: QuizMappings
}
