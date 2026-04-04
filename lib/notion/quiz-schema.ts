export type QuizRequirementKey =
  | "accuracy"
  | "askedCount"
  | "question"
  | "answer"
  | "explanation"
  | "image"
  | "priority"

export type QuizRequirementDefinition = {
  key: QuizRequirementKey
  label: string
  types: string[]
  suggestedName: string
}

export const quizRequirements: QuizRequirementDefinition[] = [
  { key: "accuracy", label: "正答率", types: ["number"], suggestedName: "Quiz Accuracy" },
  { key: "askedCount", label: "出題された回数", types: ["number"], suggestedName: "Quiz Asked Count" },
  { key: "question", label: "問題", types: ["title", "rich_text"], suggestedName: "Question" },
  { key: "answer", label: "答え", types: ["title", "rich_text"], suggestedName: "Answer" },
  { key: "explanation", label: "付加情報", types: ["rich_text"], suggestedName: "Explanation" },
  { key: "image", label: "画像", types: ["files"], suggestedName: "Image" },
  { key: "priority", label: "優先順位", types: ["select"], suggestedName: "Priority" },
]

export function getQuizRequirement(key: QuizRequirementKey) {
  const requirement = quizRequirements.find((item) => item.key === key)

  if (!requirement) {
    throw new Error(`Unknown quiz requirement: ${key}`)
  }

  return requirement
}
