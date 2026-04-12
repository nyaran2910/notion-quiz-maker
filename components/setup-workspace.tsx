"use client"

import { useEffect, useState } from "react"

import { disconnectNotion } from "@/app/actions/notion-session"
import type { AccessibleDataSource, DataSourceSchema } from "@/lib/notion/api"
import { loadSavedMappings, loadSavedSelection, saveMappings, saveSelection, type PropertyMappings } from "@/lib/quiz-config"
import {
  getQuizRequirement,
  quizRequirements,
  type QuizRequirementKey,
} from "@/lib/notion/quiz-schema"

type SetupWorkspaceProps = {
  workspaceName: string
}

const autoMatchNames: Record<QuizRequirementKey, string[]> = {
  accuracy: ["rate", "accuracy", "quizaccuracy"],
  askedCount: ["times", "askedcount", "quizaskedcount", "count"],
  question: ["question"],
  answer: ["answer"],
  explanation: ["description", "explanation"],
  image: ["image"],
  priority: ["priority"],
}

function getPropertyMatches(schema: DataSourceSchema, requirement: { types: string[] }) {
  return schema.properties.filter((property) => requirement.types.includes(property.type))
}

function normalizePropertyName(name: string) {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "")
}

function getAutoMappedProperties(schema: DataSourceSchema, currentMapping: Partial<Record<QuizRequirementKey, string>>) {
  const nextMapping = { ...currentMapping }

  for (const requirement of quizRequirements) {
    if (nextMapping[requirement.key]) {
      continue
    }

    const matchedProperty = getPropertyMatches(schema, requirement).find((property) => {
      const normalizedName = normalizePropertyName(property.name)
      return autoMatchNames[requirement.key].includes(normalizedName)
    })

    if (matchedProperty) {
      nextMapping[requirement.key] = matchedProperty.id
    }
  }

  return nextMapping
}

async function requestSchema(dataSourceId: string) {
  const response = await fetch(`/api/notion/data-sources/${dataSourceId}/schema`, {
    cache: "no-store",
  })
  const payload = await response.json()

  if (!response.ok) {
    throw new Error(payload.error ?? "Failed to load schema")
  }

  return payload.schema as DataSourceSchema | undefined
}

export function SetupWorkspace({ workspaceName }: SetupWorkspaceProps) {
  const [dataSources, setDataSources] = useState<AccessibleDataSource[]>([])
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [activeDataSourceId, setActiveDataSourceId] = useState<string | null>(null)
  const [schemas, setSchemas] = useState<Record<string, DataSourceSchema>>({})
  const [propertyMappings, setPropertyMappings] = useState<PropertyMappings>({})
  const [hasLoadedSavedConfig, setHasLoadedSavedConfig] = useState(false)
  const [loadingList, setLoadingList] = useState(true)
  const [loadingSchemaId, setLoadingSchemaId] = useState<string | null>(null)
  const [creatingRequirementKey, setCreatingRequirementKey] = useState<QuizRequirementKey | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [syncMessage, setSyncMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setSelectedIds(loadSavedSelection())
    setPropertyMappings(loadSavedMappings())
    setHasLoadedSavedConfig(true)
  }, [])

  useEffect(() => {
    if (!hasLoadedSavedConfig) {
      return
    }

    saveSelection(selectedIds)
  }, [hasLoadedSavedConfig, selectedIds])

  useEffect(() => {
    if (!hasLoadedSavedConfig) {
      return
    }

    saveMappings(propertyMappings)
  }, [hasLoadedSavedConfig, propertyMappings])

  useEffect(() => {
    if (Object.keys(schemas).length === 0) {
      return
    }

    setPropertyMappings((current) => {
      let changed = false
      const nextMappings: PropertyMappings = { ...current }

      for (const [dataSourceId, schema] of Object.entries(schemas)) {
        const currentMapping = current[dataSourceId] ?? {}
        const autoMapped = getAutoMappedProperties(schema, currentMapping)

        if (JSON.stringify(autoMapped) !== JSON.stringify(currentMapping)) {
          nextMappings[dataSourceId] = autoMapped
          changed = true
        }
      }

      return changed ? nextMappings : current
    })
  }, [schemas])

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

    let cancelled = false
    const dataSourceId = activeDataSourceId

    async function loadActiveSchema() {
      setLoadingSchemaId(dataSourceId)
      setError(null)

      try {
        const schema = await requestSchema(dataSourceId)

        if (!cancelled && schema) {
          setSchemas((current) => ({
            ...current,
            [dataSourceId]: schema,
          }))
        }
      } catch (requestError) {
        if (!cancelled) {
          setError(requestError instanceof Error ? requestError.message : "Failed to load schema")
        }
      } finally {
        if (!cancelled) {
          setLoadingSchemaId((current) => (current === dataSourceId ? null : current))
        }
      }
    }

    void loadActiveSchema()

    return () => {
      cancelled = true
    }
  }, [activeDataSourceId, schemas])

  useEffect(() => {
    const missingSelectedIds = selectedIds.filter((id) => !schemas[id])

    if (missingSelectedIds.length === 0) {
      return
    }

    let cancelled = false

    async function preloadSelectedSchemas() {
      const results = await Promise.all(
        missingSelectedIds.map(async (id) => {
          try {
            const schema = await requestSchema(id)
            return schema ? [id, schema] as const : null
          } catch {
            return null
          }
        })
      )

      if (cancelled) {
        return
      }

      const loadedEntries = results.filter((entry): entry is readonly [string, DataSourceSchema] => Boolean(entry))

      if (loadedEntries.length === 0) {
        return
      }

      setSchemas((current) => {
        const next = { ...current }

        for (const [id, schema] of loadedEntries) {
          next[id] = schema
        }

        return next
      })
    }

    void preloadSelectedSchemas()

    return () => {
      cancelled = true
    }
  }, [selectedIds, schemas])

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
  const selectedSources = dataSources
    .filter((dataSource) => selectedIds.includes(dataSource.id))
    .map((dataSource) => ({
      dataSourceId: dataSource.id,
      dataSourceName: dataSource.name,
      dataSourceUrl: dataSource.url,
      mappings: propertyMappings[dataSource.id] ?? {},
    }))
  const canSync = selectedSources.length > 0

  async function syncSelectedSources() {
    if (!canSync || syncing) {
      return
    }

    setSyncing(true)
    setSyncMessage(null)
    setError(null)

    try {
      const response = await fetch("/api/notion/sync", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sources: selectedSources,
        }),
      })
      const payload = await response.json()

      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to sync quiz sources")
      }

      setSyncMessage(`${payload.sourceCount ?? 0} 件のデータベースから ${payload.questionCount ?? 0} 問を同期しました。`)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to sync quiz sources")
    } finally {
      setSyncing(false)
    }
  }

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
          <span className="stat-chip">データベース {dataSources.length}</span>
          <span className="stat-chip">選択中 {selectedIds.length}</span>
        </div>

        <p className="help-text">クイズ対象にしたいデータベースを選びます。選択状態とマッピングはこのブラウザに保存されます。</p>
        <div className="card-actions">
          <button
            type="button"
            className="primary-button"
            disabled={!canSync || syncing}
            onClick={() => void syncSelectedSources()}
          >
            {syncing ? "同期中..." : "選択中を同期"}
          </button>
        </div>

        {loadingList ? <p className="status-text">データベース一覧を読み込み中...</p> : null}
        {error ? <p className="error-text">{error}</p> : null}
        {syncMessage ? <p className="status-text">{syncMessage}</p> : null}

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
          <span className="eyebrow">マッピング</span>
          <h2>プロパティ対応</h2>
        </div>

        {selectedIds.length > 0 ? (
          <p className="help-text">選択済み: {selectedIds.length} 個のデータベース</p>
        ) : (
          <p className="help-text">まだ対象は選ばれていません。左側から追加してください。</p>
        )}

        {!activeDataSourceId ? <p className="status-text">「詳細」を押すとここにプロパティ一覧を表示します。</p> : null}
        {loadingSchemaId ? <p className="status-text">プロパティ一覧を読み込み中...</p> : null}

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
