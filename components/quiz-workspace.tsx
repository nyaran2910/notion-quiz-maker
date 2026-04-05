"use client"

import { useEffect, useState } from "react"

import { QuizRunner } from "@/components/quiz-runner"
import type { AccessibleDataSource } from "@/lib/notion/api"
import { loadSavedMappings, loadSavedSelection } from "@/lib/quiz-config"
import { quizRequirements } from "@/lib/notion/quiz-schema"

export function QuizWorkspace() {
  const [dataSources, setDataSources] = useState<AccessibleDataSource[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [propertyMappings, setPropertyMappings] = useState(loadSavedMappings())
  const [hasLoadedSavedConfig, setHasLoadedSavedConfig] = useState(false)

  useEffect(() => {
    setSelectedIds(loadSavedSelection())
    setPropertyMappings(loadSavedMappings())
    setHasLoadedSavedConfig(true)
  }, [])

  useEffect(() => {
    let cancelled = false

    async function loadDataSources() {
      setLoading(true)
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
          setLoading(false)
        }
      }
    }

    void loadDataSources()

    return () => {
      cancelled = true
    }
  }, [])

  const readySources = (hasLoadedSavedConfig ? selectedIds : [])
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
      <section className="panel">
        <div className="panel-header">
          <span className="eyebrow">準備完了</span>
          <h2>出題できるデータベース</h2>
        </div>

        {loading ? <p className="status-text">選択済みデータベースを読み込み中...</p> : null}
        {error ? <p className="error-text">{error}</p> : null}

        {!loading && readySources.length === 0 ? (
          <p className="help-text">
            まだクイズを開始できるデータベースがありません。`/setup` で対象選択とプロパティマッピングを済ませてください。
          </p>
        ) : null}

        {readySources.length > 0 ? (
          <div className="summary-grid ready-grid">
            {readySources.map((source) => (
              <div key={source.dataSourceId} className="summary-card">
                <span className="list-label">準備完了</span>
                <strong>{source.dataSourceName}</strong>
              </div>
            ))}
          </div>
        ) : null}
      </section>

      {readySources.length > 0 ? <QuizRunner sources={readySources} /> : null}
    </section>
  )
}
