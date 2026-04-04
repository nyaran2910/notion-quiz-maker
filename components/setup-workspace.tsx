"use client"

import { useEffect, useState } from "react"

import { disconnectNotion } from "@/app/actions/notion-session"
import { QuizRunner } from "@/components/quiz-runner"
import type { AccessibleDataSource, DataSourceSchema } from "@/lib/notion/api"
import {
  getQuizRequirement,
  quizRequirements,
  type QuizRequirementKey,
} from "@/lib/notion/quiz-schema"

const SELECTION_STORAGE_KEY = "selected-notion-data-sources"
const MAPPING_STORAGE_KEY = "notion-property-mappings"

type SetupWorkspaceProps = {
  workspaceName: string
}

type PropertyMappings = Record<string, Partial<Record<QuizRequirementKey, string>>>

function loadSavedSelection() {
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

function loadSavedMappings(): PropertyMappings {
  if (typeof window === "undefined") {
    return {}
  }

  try {
    const raw = window.localStorage.getItem(MAPPING_STORAGE_KEY)

    if (!raw) {
      return {}
    }

    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === "object" ? parsed as PropertyMappings : {}
  } catch {
    return {}
  }
}

function getPropertyMatches(schema: DataSourceSchema, requirement: { types: string[] }) {
  return schema.properties.filter((property) => requirement.types.includes(property.type))
}

export function SetupWorkspace({ workspaceName }: SetupWorkspaceProps) {
  const [dataSources, setDataSources] = useState<AccessibleDataSource[]>([])
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [activeDataSourceId, setActiveDataSourceId] = useState<string | null>(null)
  const [schemas, setSchemas] = useState<Record<string, DataSourceSchema>>({})
  const [propertyMappings, setPropertyMappings] = useState<PropertyMappings>({})
  const [loadingList, setLoadingList] = useState(true)
  const [loadingSchemaId, setLoadingSchemaId] = useState<string | null>(null)
  const [creatingRequirementKey, setCreatingRequirementKey] = useState<QuizRequirementKey | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setSelectedIds(loadSavedSelection())
    setPropertyMappings(loadSavedMappings())
  }, [])

  useEffect(() => {
    window.localStorage.setItem(SELECTION_STORAGE_KEY, JSON.stringify(selectedIds))
  }, [selectedIds])

  useEffect(() => {
    window.localStorage.setItem(MAPPING_STORAGE_KEY, JSON.stringify(propertyMappings))
  }, [propertyMappings])

  useEffect(() => {
    let cancelled = false

    async function loadDataSources() {
      setLoadingList(true)
      setError(null)

      try {
        const response = await fetch("/api/notion/data-sources", {
          cache: "no-store",
        })
        const payload = await response.json()

        if (!response.ok) {
          throw new Error(payload.error ?? "Failed to load data sources")
        }

        if (!cancelled) {
          setDataSources(payload.dataSources ?? [])
        }
      } catch (requestError) {
        if (!cancelled) {
          setError(requestError instanceof Error ? requestError.message : "Failed to load data sources")
        }
      } finally {
        if (!cancelled) {
          setLoadingList(false)
        }
      }
    }

    void loadDataSources()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!activeDataSourceId || schemas[activeDataSourceId]) {
      return
    }

    const currentId = activeDataSourceId
    let cancelled = false

    async function loadSchema() {
      setLoadingSchemaId(currentId)
      setError(null)

      try {
        const response = await fetch(`/api/notion/data-sources/${currentId}/schema`, {
          cache: "no-store",
        })
        const payload = await response.json()

        if (!response.ok) {
          throw new Error(payload.error ?? "Failed to load schema")
        }

        if (!cancelled && payload.schema) {
          setSchemas((current) => ({
            ...current,
            [currentId]: payload.schema,
          }))
        }
      } catch (requestError) {
        if (!cancelled) {
          setError(requestError instanceof Error ? requestError.message : "Failed to load schema")
        }
      } finally {
        if (!cancelled) {
          setLoadingSchemaId(null)
        }
      }
    }

    void loadSchema()

    return () => {
      cancelled = true
    }
  }, [activeDataSourceId, schemas])

  function toggleSelection(id: string) {
    setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])
  }

  function updateMapping(dataSourceId: string, requirementKey: QuizRequirementKey, propertyId: string) {
    setPropertyMappings((current) => ({
      ...current,
      [dataSourceId]: {
        ...current[dataSourceId],
        [requirementKey]: propertyId,
      },
    }))
  }

  async function createProperty(dataSourceId: string, requirementKey: QuizRequirementKey) {
    setCreatingRequirementKey(requirementKey)
    setError(null)

    try {
      const response = await fetch(`/api/notion/data-sources/${dataSourceId}/properties`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ requirementKey }),
      })
      const payload = await response.json()

      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to create property")
      }

      if (payload.schema) {
        setSchemas((current) => ({
          ...current,
          [dataSourceId]: payload.schema,
        }))

        const requirement = getQuizRequirement(requirementKey)
        const createdProperty = payload.schema.properties.find(
          (property: DataSourceSchema["properties"][number]) => property.name === requirement.suggestedName
        )

        if (createdProperty) {
          updateMapping(dataSourceId, requirementKey, createdProperty.id)
        }
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to create property")
    } finally {
      setCreatingRequirementKey(null)
    }
  }

  const activeSchema = activeDataSourceId ? schemas[activeDataSourceId] : null
  const activeMapping = activeDataSourceId ? (propertyMappings[activeDataSourceId] ?? {}) : {}
  const activeDataSource = activeDataSourceId ? dataSources.find((item) => item.id === activeDataSourceId) ?? null : null
  const hasCompleteMapping = quizRequirements.every((requirement) => {
    return Boolean(activeMapping[requirement.key])
  })
  const readySources = selectedIds
    .map((id) => {
      const dataSource = dataSources.find((item) => item.id === id)
      const mappings = propertyMappings[id] ?? {}
      const isReady = quizRequirements.every((requirement) => Boolean(mappings[requirement.key]))

      if (!dataSource || !isReady) {
        return null
      }

      return {
        dataSourceId: dataSource.id,
        dataSourceName: dataSource.name,
        mappings,
      }
    })
    .filter((source): source is NonNullable<typeof source> => Boolean(source))

  return (
    <section className="workspace-stack">
      <div className="workspace-grid">
      <div className="panel">
        <div className="panel-header panel-header-row">
          <div>
            <span className="eyebrow">Connected</span>
            <h2>{workspaceName}</h2>
          </div>

          <form action={disconnectNotion}>
            <button type="submit" className="ghost-button">
              Disconnect
            </button>
          </form>
        </div>

        <p className="help-text">
          まずは対象にしたい data source を選びます。選択状態はブラウザに保存し、あとで追加や削除ができます。
        </p>

        {loadingList ? <p className="status-text">Loading data sources...</p> : null}
        {error ? <p className="error-text">{error}</p> : null}

        <div className="data-source-list">
          {dataSources.map((item) => {
            const isSelected = selectedIds.includes(item.id)

            return (
              <article key={item.id} className={`data-source-card${isSelected ? " selected" : ""}`}>
                <div className="card-body">
                  <p className="card-kicker">{item.databaseTitle}</p>
                  <h3>{item.name}</h3>
                  <p className="meta-text">{new Date(item.lastEditedTime).toLocaleString("ja-JP")}</p>
                </div>

                <div className="card-actions">
                  <button
                    type="button"
                    className={isSelected ? "ghost-button" : "primary-button"}
                    onClick={() => toggleSelection(item.id)}
                  >
                    {isSelected ? "Remove" : "Select"}
                  </button>
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={() => setActiveDataSourceId(item.id)}
                  >
                    Inspect schema
                  </button>
                </div>
              </article>
            )
          })}
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">
          <span className="eyebrow">Step 2</span>
          <h2>Schema Check</h2>
        </div>

        {selectedIds.length > 0 ? (
          <p className="help-text">選択済み: {selectedIds.length} 個の data source</p>
        ) : (
          <p className="help-text">まだ対象は選ばれていません。左側から追加してください。</p>
        )}

        {!activeDataSourceId ? <p className="status-text">Inspect schema を押すとここに詳細を表示します。</p> : null}
        {loadingSchemaId ? <p className="status-text">Loading schema...</p> : null}

        {activeSchema ? (
          <div className="schema-panel">
            <div className="schema-header">
              <h3>{activeSchema.title}</h3>
              <p className="meta-text">{activeSchema.id}</p>
            </div>

            <div className="requirement-grid">
              {quizRequirements.map((requirement) => {
                const matches = getPropertyMatches(activeSchema, requirement)
                const selectedPropertyId = activeMapping[requirement.key] ?? ""

                return (
                  <div key={requirement.key} className="requirement-card">
                    <div className="requirement-head">
                      <strong>{requirement.label}</strong>
                      <span className={matches.length > 0 ? "ok-pill" : "warn-pill"}>
                        {matches.length > 0 ? "Candidate found" : "Missing"}
                      </span>
                    </div>
                    <p className="meta-text">許可型: {requirement.types.join(", ")}</p>
                    {matches.length > 0 ? (
                      <div className="mapping-block">
                        <label className="field">
                          <span>使うプロパティ</span>
                          <select
                            value={selectedPropertyId}
                            onChange={(event) =>
                              updateMapping(activeSchema.id, requirement.key, event.target.value)
                            }
                          >
                            <option value="">選択してください</option>
                            {matches.map((property) => (
                              <option key={property.id} value={property.id}>
                                {property.name} ({property.type})
                              </option>
                            ))}
                          </select>
                        </label>

                        <ul className="property-list">
                          {matches.map((property) => (
                            <li key={property.id}>
                              <code>{property.name}</code>
                              <span>{property.type}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : (
                      <div className="missing-block">
                        <p className="help-text">
                          この型に合うプロパティがありません。推奨名は <code>{requirement.suggestedName}</code> です。
                        </p>
                        <button
                          type="button"
                          className="primary-button"
                          disabled={creatingRequirementKey === requirement.key}
                          onClick={() => createProperty(activeSchema.id, requirement.key)}
                        >
                          {creatingRequirementKey === requirement.key ? "Creating..." : "Create property"}
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ) : null}
      </div>
      </div>

      {selectedIds.length > 0 ? (
        readySources.length > 0 ? (
          <QuizRunner sources={readySources} />
        ) : (
          <section className="panel quiz-panel">
            <div className="panel-header">
              <span className="eyebrow">Step 3</span>
              <h2>Quiz Runner</h2>
            </div>
            <p className="help-text">
              クイズを開始するには、選択済み data source のうち少なくとも 1 つで 7 つの要件すべてのマッピングを埋めてください。
            </p>
            {activeDataSource && !hasCompleteMapping ? (
              <p className="meta-text">
                現在表示中の {activeDataSource.name} はまだ設定途中です。
              </p>
            ) : null}
          </section>
        )
      ) : null}
    </section>
  )
}
