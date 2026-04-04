import type { QuizRequirementKey } from "./notion/quiz-schema"

export const SELECTION_STORAGE_KEY = "selected-notion-data-sources"
export const MAPPING_STORAGE_KEY = "notion-property-mappings"

export type PropertyMappings = Record<string, Partial<Record<QuizRequirementKey, string>>>

export function loadSavedSelection() {
  if (typeof window === "undefined") {
    return []
  }

  try {
    const raw = window.localStorage.getItem(SELECTION_STORAGE_KEY)

    if (!raw) {
      return []
    }

    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string") : []
  } catch {
    return []
  }
}

export function loadSavedMappings(): PropertyMappings {
  if (typeof window === "undefined") {
    return {}
  }

  try {
    const raw = window.localStorage.getItem(MAPPING_STORAGE_KEY)

    if (!raw) {
      return {}
    }

    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === "object" ? (parsed as PropertyMappings) : {}
  } catch {
    return {}
  }
}
