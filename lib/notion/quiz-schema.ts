export type QuizRequirementKey =
  | "question"
  | "answer"
  | "explanation"
  | "image"

export type QuizRequirementDefinition = {
  key: QuizRequirementKey
  label: string
  types: string[]
  suggestedName: string
  required: boolean
}

export const quizRequirements: QuizRequirementDefinition[] = [
  { key: "question", label: "問題", types: ["title", "rich_text"], suggestedName: "Question", required: true },
  { key: "answer", label: "答え", types: ["title", "rich_text"], suggestedName: "Answer", required: true },
  { key: "explanation", label: "付加情報", types: ["rich_text"], suggestedName: "Description", required: false },
  { key: "image", label: "画像", types: ["files"], suggestedName: "Image", required: false },
]

export function getQuizRequirement(key: QuizRequirementKey) {
  const requirement = quizRequirements.find((item) => item.key === key)

  if (!requirement) {
    throw new Error(`Unknown quiz requirement: ${key}`)
  }

  return requirement
}
