"use client"

import { useEffect, useState } from "react"

import { disconnectNotion } from "@/app/actions/notion-session"
import type { AccessibleDataSource, DataSourceSchema } from "@/lib/notion/api"
import { loadSavedMappings, loadSavedSelection, MAPPING_STORAGE_KEY, type PropertyMappings, SELECTION_STORAGE_KEY } from "@/lib/quiz-config"
import {
  getQuizRequirement,
  quizRequirements,
  type QuizRequirementKey,
} from "@/lib/notion/quiz-schema"

type SetupWorkspaceProps = {
  workspaceName: string
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

  return (
    <section className="workspace-grid">
      <div className="panel">
        <div className="panel-header panel-header-row">
          <div>
            <span className="eyebrow">接続中</span>
            <h2>{workspaceName}</h2>
          </div>

          <form action={disconnectNotion}>
            <button type="submit" className="ghost-button">
              接続解除
            </button>
          </form>
        </div>

        <div className="inline-stats">
          <span className="stat-chip">data source {dataSources.length}</span>
          <span className="stat-chip">選択中 {selectedIds.length}</span>
        </div>

        <p className="help-text">クイズ対象にしたい data source を選びます。選択状態とマッピングはブラウザに保存されます。</p>

        {loadingList ? <p className="status-text">Loading data sources...</p> : null}
        {error ? <p className="error-text">{error}</p> : null}

        <div className="data-source-list">
          {dataSources.map((item) => {
            const isSelected = selectedIds.includes(item.id)

            return (
              <article key={item.id} className={`data-source-card${isSelected ? " selected" : ""}`}>
                <div className="data-source-main">
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
                      {isSelected ? "解除" : "選択"}
                    </button>
                    <button
                      type="button"
                      className="ghost-button"
                      onClick={() => setActiveDataSourceId(item.id)}
                    >
                      詳細
                    </button>
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">
          <span className="eyebrow">Schema</span>
          <h2>Property Mapping</h2>
        </div>

        {selectedIds.length > 0 ? (
          <p className="help-text">選択済み: {selectedIds.length} 個の data source</p>
        ) : (
          <p className="help-text">まだ対象は選ばれていません。左側から追加してください。</p>
        )}

        {!activeDataSourceId ? <p className="status-text">詳細 を押すとここに schema を表示します。</p> : null}
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
                        {matches.length > 0 ? "候補あり" : "不足"}
                      </span>
                    </div>
                    <p className="meta-text">許可型: {requirement.types.join(", ")}</p>
                    {matches.length > 0 ? (
                      <div className="mapping-block">
                        <label className="field">
                          <span>使うプロパティ</span>
                          <select
                            value={selectedPropertyId}
                            onChange={(event) => updateMapping(activeSchema.id, requirement.key, event.target.value)}
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
                          {creatingRequirementKey === requirement.key ? "作成中..." : "プロパティを作成"}
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
    </section>
  )
}
