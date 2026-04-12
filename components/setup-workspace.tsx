"use client"

import { useEffect, useState } from "react"

import type { AccessibleDataSource, DataSourceSchema } from "@/lib/notion/api"
import type { QuizSourceConfig } from "@/lib/notion/quiz-types"
import { loadSavedMappings, loadSavedSelection, saveMappings, saveSelection, type PropertyMappings } from "@/lib/quiz-config"
import {
  getQuizRequirement,
  quizRequirements,
  type QuizRequirementKey,
} from "@/lib/notion/quiz-schema"

type SetupWorkspaceProps = {
  workspaceName: string
}

type QuizSetSummary = {
  id: string
  name: string
  description: string | null
  updatedAt: string
  sources: QuizSourceConfig[]
}

function getRequiredQuizRequirements() {
  return quizRequirements.filter((requirement) => requirement.required)
}

function summarizeSourceNames(sources: QuizSourceConfig[]) {
  return sources.map((source) => source.dataSourceName).join(" / ")
}

function countMappedRequirements(mapping: Partial<Record<QuizRequirementKey, string>>) {
  return getRequiredQuizRequirements().filter((requirement) => Boolean(mapping[requirement.key])).length
}

const autoMatchNames: Record<QuizRequirementKey, string[]> = {
  question: ["question"],
  answer: ["answer"],
  explanation: ["description", "explanation"],
  image: ["image"],
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
  const [isPickerOpen, setIsPickerOpen] = useState(false)
  const [schemas, setSchemas] = useState<Record<string, DataSourceSchema>>({})
  const [propertyMappings, setPropertyMappings] = useState<PropertyMappings>({})
  const [hasLoadedSavedConfig, setHasLoadedSavedConfig] = useState(false)
  const [loadingList, setLoadingList] = useState(true)
  const [loadingSchemaId, setLoadingSchemaId] = useState<string | null>(null)
  const [creatingRequirementKey, setCreatingRequirementKey] = useState<QuizRequirementKey | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [syncMessage, setSyncMessage] = useState<string | null>(null)
  const [resettingDataSourceId, setResettingDataSourceId] = useState<string | null>(null)
  const [confirmingResetDataSourceId, setConfirmingResetDataSourceId] = useState<string | null>(null)
  const [quizSets, setQuizSets] = useState<QuizSetSummary[]>([])
  const [loadingQuizSets, setLoadingQuizSets] = useState(true)
  const [savingQuizSet, setSavingQuizSet] = useState(false)
  const [deletingQuizSetId, setDeletingQuizSetId] = useState<string | null>(null)
  const [editingQuizSetId, setEditingQuizSetId] = useState<string | null>(null)
  const [quizSetName, setQuizSetName] = useState("")
  const [quizSetDescription, setQuizSetDescription] = useState("")
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setSelectedIds(loadSavedSelection())
    setPropertyMappings(loadSavedMappings())
    setHasLoadedSavedConfig(true)
  }, [])

  useEffect(() => {
    if (!isPickerOpen) {
      return
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsPickerOpen(false)
      }
    }

    document.addEventListener("keydown", handleEscape)

    return () => {
      document.removeEventListener("keydown", handleEscape)
    }
  }, [isPickerOpen])

  useEffect(() => {
    if (!confirmingResetDataSourceId) {
      return
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setConfirmingResetDataSourceId(null)
      }
    }

    document.addEventListener("keydown", handleEscape)

    return () => {
      document.removeEventListener("keydown", handleEscape)
    }
  }, [confirmingResetDataSourceId])

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

  useEffect(() => {
    let cancelled = false

    async function loadQuizSets() {
      setLoadingQuizSets(true)

      try {
        const response = await fetch("/api/quiz-sets", { cache: "no-store" })
        const payload = await response.json()

        if (!response.ok) {
          throw new Error(payload.error ?? "Failed to load quiz sets")
        }

        if (!cancelled) {
          setQuizSets(payload.quizSets ?? [])
        }
      } catch (requestError) {
        if (!cancelled) {
          setError(requestError instanceof Error ? requestError.message : "Failed to load quiz sets")
        }
      } finally {
        if (!cancelled) {
          setLoadingQuizSets(false)
        }
      }
    }

    void loadQuizSets()

    return () => {
      cancelled = true
    }
  }, [])

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
  const readySelectedSources = selectedSources.filter((source) => getRequiredQuizRequirements().every((requirement) => Boolean(source.mappings[requirement.key])))
  const canSync = selectedSources.length > 0
  const selectedDataSources = dataSources.filter((item) => selectedIds.includes(item.id))

  async function refreshQuizSets() {
    const response = await fetch("/api/quiz-sets", { cache: "no-store" })
    const payload = await response.json()

    if (!response.ok) {
      throw new Error(payload.error ?? "Failed to load quiz sets")
    }

    setQuizSets(payload.quizSets ?? [])
  }

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

  async function saveCurrentQuizSet() {
    if (readySelectedSources.length === 0 || savingQuizSet) {
      return
    }

    setSavingQuizSet(true)
    setSyncMessage(null)
    setError(null)

    const method = editingQuizSetId ? "PATCH" : "POST"
    const endpoint = editingQuizSetId ? `/api/quiz-sets/${editingQuizSetId}` : "/api/quiz-sets"
    const successMessage = editingQuizSetId ? "クイズ集を更新しました。" : "クイズ集を保存しました。"

    try {
      const response = await fetch(endpoint, {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: quizSetName.trim() || `クイズ集 ${new Date().toLocaleString("ja-JP")}`,
          description: quizSetDescription.trim() || null,
          sources: readySelectedSources,
        }),
      })
      const payload = await response.json()

      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to save quiz set")
      }

      setQuizSetName("")
      setQuizSetDescription("")
      setEditingQuizSetId(null)
      await refreshQuizSets()
      setSyncMessage(successMessage)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to save quiz set")
    } finally {
      setSavingQuizSet(false)
    }
  }

  async function removeQuizSet(quizSetId: string) {
    setDeletingQuizSetId(quizSetId)
    setError(null)

    try {
      const response = await fetch(`/api/quiz-sets/${quizSetId}`, {
        method: "DELETE",
      })
      const payload = await response.json()

      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to delete quiz set")
      }

      await refreshQuizSets()
      if (editingQuizSetId === quizSetId) {
        setEditingQuizSetId(null)
        setQuizSetName("")
        setQuizSetDescription("")
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to delete quiz set")
    } finally {
      setDeletingQuizSetId(null)
    }
  }

  async function resetDataSourceMetadata(dataSourceId: string) {
    setResettingDataSourceId(dataSourceId)
    setError(null)
    setSyncMessage(null)

    try {
      const response = await fetch(`/api/notion/data-sources/${dataSourceId}/metadata`, {
        method: "DELETE",
      })
      const payload = await response.json()

      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to reset data source metadata")
      }

      const dataSourceName = dataSources.find((item) => item.id === dataSourceId)?.name ?? "対象データベース"
      setConfirmingResetDataSourceId(null)
      setSyncMessage(`${dataSourceName} の学習メタデータを削除しました。次回から出題頻度を再学習します。`)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to reset data source metadata")
    } finally {
      setResettingDataSourceId((current) => (current === dataSourceId ? null : current))
    }
  }

  function beginEditQuizSet(quizSet: QuizSetSummary) {
    setEditingQuizSetId(quizSet.id)
    setQuizSetName(quizSet.name)
    setQuizSetDescription(quizSet.description ?? "")
    setSelectedIds(quizSet.sources.map((source) => source.dataSourceId))
    setPropertyMappings((current) => ({
      ...current,
      ...Object.fromEntries(quizSet.sources.map((source) => [source.dataSourceId, source.mappings])),
    }))
  }

  return (
    <>
      <section className="workspace-stack">
        <div className="panel workspace-overview-panel">
          <div className="panel-header">
            <span className="eyebrow">接続中</span>
            <h2>{workspaceName}</h2>
          </div>

          <p className="help-text">クイズ対象にしたいデータベースを選び、必要なプロパティを割り当ててから同期します。</p>

          <div className="workspace-actions-row">
            <button type="button" className="ghost-button" onClick={() => setIsPickerOpen(true)}>
              データベースを選ぶ
            </button>
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

          <div className="selected-source-list">
            {selectedDataSources.length > 0 ? (
              selectedDataSources.map((item) => (
                <article key={item.id} className="selected-source-card">
                  <div className="card-body">
                    {item.parentTitle ? <p className="card-kicker">{item.parentTitle}</p> : null}
                    <h3>{item.name}</h3>
                    <p className="meta-text">
                      必須プロパティ {countMappedRequirements(propertyMappings[item.id] ?? {})}/{getRequiredQuizRequirements().length}
                    </p>
                  </div>
                  <div className="card-actions">
                    <button type="button" className="ghost-button" onClick={() => setConfirmingResetDataSourceId(item.id)}>
                      メタデータ削除
                    </button>
                    <button type="button" className="ghost-button" onClick={() => setActiveDataSourceId(item.id)}>
                      プロパティ編集
                    </button>
                    <button type="button" className="ghost-button" onClick={() => toggleSelection(item.id)}>
                      解除
                    </button>
                  </div>
                </article>
              ))
            ) : (
              <p className="help-text">まだデータベースは選択されていません。</p>
            )}
          </div>
        </div>

        <div className="panel workspace-quizset-panel">
        <div className="panel-header">
          <span className="eyebrow">クイズ集</span>
          <h2>保存済みクイズ集</h2>
        </div>

        <div className="auth-form-grid">
          <label className="field">
            <span>名前</span>
            <input value={quizSetName} onChange={(event) => setQuizSetName(event.target.value)} placeholder="例: 英単語テスト" />
          </label>
          <label className="field">
            <span>説明</span>
            <input value={quizSetDescription} onChange={(event) => setQuizSetDescription(event.target.value)} placeholder="任意" />
          </label>
          <button type="button" className="primary-button" disabled={savingQuizSet || readySelectedSources.length === 0} onClick={() => void saveCurrentQuizSet()}>
            {savingQuizSet ? "保存中..." : editingQuizSetId ? `クイズ集を更新 (${readySelectedSources.length})` : `現在の設定をクイズ集として保存 (${readySelectedSources.length})`}
          </button>
        </div>

        {loadingQuizSets ? <p className="status-text">クイズ集を読み込み中...</p> : null}
        {!loadingQuizSets && quizSets.length === 0 ? <p className="help-text">まだ保存済みクイズ集はありません。</p> : null}

        {quizSets.length > 0 ? (
          <div className="data-source-list quiz-set-list compact-card-list">
            {quizSets.map((quizSet) => (
              <article key={quizSet.id} className="data-source-card compact-card">
                <div className="card-body">
                  <h3>{quizSet.name}</h3>
                  <p className="help-text">{summarizeSourceNames(quizSet.sources)}</p>
                  {quizSet.description ? <p className="meta-text">{quizSet.description}</p> : null}
                </div>
                <div className="card-actions">
                  <button type="button" className="ghost-button" onClick={() => beginEditQuizSet(quizSet)}>
                    編集
                  </button>
                  <button type="button" className="ghost-button" disabled={deletingQuizSetId === quizSet.id} onClick={() => void removeQuizSet(quizSet.id)}>
                    {deletingQuizSetId === quizSet.id ? "削除中..." : "削除"}
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : null}
        </div>
      </section>

      {isPickerOpen ? (
        <div className="picker-modal" role="dialog" aria-modal="true" aria-label="データベース選択">
          <button type="button" className="picker-modal-backdrop" aria-label="閉じる" onClick={() => setIsPickerOpen(false)} />
          <div className="picker-modal-panel">
            <div className="picker-modal-header">
              <div>
                <p className="eyebrow">データベース選択</p>
                <h3>クイズ対象に使うデータベース</h3>
                <p className="meta-text">一覧はスクロール可能です。数が増えても画面全体は伸びません。</p>
              </div>
              <button type="button" className="ghost-button" onClick={() => setIsPickerOpen(false)}>
                閉じる
              </button>
            </div>

            {loadingList ? <p className="status-text">データベース一覧を読み込み中...</p> : null}

            <div className="picker-modal-list">
              {dataSources.map((item) => {
                const isSelected = selectedIds.includes(item.id)

                return (
                  <article key={item.id} className={`data-source-card compact-card picker-card${isSelected ? " selected" : ""}`}>
                    <div className="picker-card-main">
                      <div className="card-body">
                        {item.parentTitle ? <p className="card-kicker">{item.parentTitle}</p> : null}
                        <h3>{item.name}</h3>
                      </div>

                      <div className="card-actions">
                        <button
                          type="button"
                          className={isSelected ? "ghost-button" : "primary-button"}
                          onClick={() => toggleSelection(item.id)}
                        >
                          {isSelected ? "解除" : "選択"}
                        </button>
                      </div>
                    </div>
                  </article>
                )
              })}
            </div>
          </div>
        </div>
      ) : null}

      {activeSchema ? (
        <div className="picker-modal property-modal" role="dialog" aria-modal="true" aria-label="プロパティ編集">
          <button type="button" className="picker-modal-backdrop" aria-label="閉じる" onClick={() => setActiveDataSourceId(null)} />
          <div className="picker-modal-panel property-modal-panel">
            <div className="picker-modal-header">
              <div>
                <p className="eyebrow">プロパティ対応</p>
                <h3>{activeSchema.title}</h3>
                <p className="meta-text">{activeSchema.id}</p>
              </div>
              <button type="button" className="ghost-button" onClick={() => setActiveDataSourceId(null)}>
                閉じる
              </button>
            </div>

            {loadingSchemaId ? <p className="status-text">プロパティ一覧を読み込み中...</p> : null}

            <div className="requirement-grid property-modal-grid">
              {quizRequirements.map((requirement) => {
                const matches = getPropertyMatches(activeSchema, requirement)
                const selectedPropertyId = activeMapping[requirement.key] ?? ""

                return (
                  <div key={requirement.key} className="requirement-card">
                    <div className="requirement-head">
                      <strong>{requirement.label}</strong>
                      <span className={matches.length > 0 ? "ok-pill" : "warn-pill"}>
                        {requirement.required ? (matches.length > 0 ? "必須" : "不足") : "任意"}
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
        </div>
      ) : null}

      {confirmingResetDataSourceId ? (
        <div className="picker-modal property-modal" role="dialog" aria-modal="true" aria-label="メタデータ削除の確認">
          <button type="button" className="picker-modal-backdrop" aria-label="閉じる" onClick={() => setConfirmingResetDataSourceId(null)} />
          <div className="picker-modal-panel metadata-reset-modal-panel">
            <div className="picker-modal-header">
              <div>
                <p className="eyebrow">メタデータ削除</p>
                <h3>{dataSources.find((item) => item.id === confirmingResetDataSourceId)?.name ?? "データベース"}</h3>
                <p className="meta-text">このデータベースに紐づく学習履歴を Postgres から削除します。</p>
              </div>
              <button type="button" className="ghost-button" onClick={() => setConfirmingResetDataSourceId(null)}>
                閉じる
              </button>
            </div>

            <div className="metadata-reset-copy">
              <p className="help-text">削除される内容:</p>
              <ul className="property-list metadata-reset-list">
                <li>正答数・誤答数・正答率</li>
                <li>出題頻度の学習状態</li>
                <li>このデータベース由来の回答履歴</li>
              </ul>
              <p className="help-text">プロパティ割り当てや選択状態は残ります。必要なら削除後に再同期してください。</p>
            </div>

            <div className="card-actions metadata-reset-actions">
              <button type="button" className="ghost-button" onClick={() => setConfirmingResetDataSourceId(null)}>
                キャンセル
              </button>
              <button
                type="button"
                className="primary-button danger-button"
                disabled={resettingDataSourceId === confirmingResetDataSourceId}
                onClick={() => void resetDataSourceMetadata(confirmingResetDataSourceId)}
              >
                {resettingDataSourceId === confirmingResetDataSourceId ? "削除中..." : "削除してリセット"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
