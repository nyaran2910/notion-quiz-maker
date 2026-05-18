import type { QuizRequirementKey } from "./notion/quiz-schema"

export const SELECTION_STORAGE_KEY = "selected-notion-data-sources"
export const MAPPING_STORAGE_KEY = "notion-property-mappings"

export type PropertyMappings = Record<string, Partial<Record<QuizRequirementKey, string>>>

function readJsonStorage<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") {
    return fallback
  }

  try {
    const raw = window.localStorage.getItem(key)

    if (!raw) {
      return fallback
    }

    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function writeJsonStorage(key: string, value: unknown) {
  if (typeof window === "undefined") {
    return
  }

  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Ignore storage failures so the UI still works in private mode or restricted environments.
  }
}

export function loadSavedSelection() {
  const parsed = readJsonStorage<unknown>(SELECTION_STORAGE_KEY, [])
  return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string") : []
}

export function loadSavedMappings(): PropertyMappings {
  const parsed = readJsonStorage<unknown>(MAPPING_STORAGE_KEY, {})
  return parsed && typeof parsed === "object" ? (parsed as PropertyMappings) : {}
}

export function saveSelection(selectedIds: string[]) {
  writeJsonStorage(SELECTION_STORAGE_KEY, selectedIds)
}

export function saveMappings(mappings: PropertyMappings) {
  writeJsonStorage(MAPPING_STORAGE_KEY, mappings)
}
