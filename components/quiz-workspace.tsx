"use client"

import { useEffect, useState } from "react"

import { QuizRunner } from "@/components/quiz-runner"
import type { QuizSourceConfig } from "@/lib/notion/quiz-types"

type QuizSetSummary = {
  id: string
  name: string
  description: string | null
  updatedAt: string
  sources: QuizSourceConfig[]
}

function summarizeSourceNames(sources: QuizSourceConfig[]) {
  return sources.map((source) => source.dataSourceName).join(" / ")
}

export function QuizWorkspace() {
  const [quizSets, setQuizSets] = useState<QuizSetSummary[]>([])
  const [selectedQuizSetId, setSelectedQuizSetId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function loadQuizSets() {
      setLoading(true)
      setError(null)

      try {
        const response = await fetch("/api/quiz-sets", {
          cache: "no-store",
        })
        const payload = await response.json()

        if (!response.ok) {
          throw new Error(payload.error ?? "Failed to load quiz sets")
        }

        if (!cancelled) {
          const nextQuizSets = payload.quizSets ?? []
          setQuizSets(nextQuizSets)
          setSelectedQuizSetId((current) => current ?? nextQuizSets[0]?.id ?? null)
        }
      } catch (requestError) {
        if (!cancelled) {
          setError(requestError instanceof Error ? requestError.message : "Failed to load quiz sets")
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void loadQuizSets()

    return () => {
      cancelled = true
    }
  }, [])

  const selectedQuizSet = quizSets.find((quizSet) => quizSet.id === selectedQuizSetId) ?? null
  const readySources = selectedQuizSet?.sources ?? []

  return (
    <section className="workspace-stack">
      <section className="panel">
        <div className="panel-header">
          <span className="eyebrow">準備完了</span>
          <h2>クイズ集を選ぶ</h2>
        </div>

        {loading ? <p className="status-text">クイズ集を読み込み中...</p> : null}
        {error ? <p className="error-text">{error}</p> : null}

        {!loading && quizSets.length === 0 ? (
          <p className="help-text">
            まだクイズ集がありません。`/setup` で対象選択とプロパティマッピングを済ませて保存してください。
          </p>
        ) : null}

        {quizSets.length > 0 ? (
          <div className="data-source-list quiz-set-list compact-card-list">
            {quizSets.map((quizSet) => {
              const isSelected = quizSet.id === selectedQuizSetId

              return (
                <button key={quizSet.id} type="button" className={`data-source-card compact-card quiz-set-card${isSelected ? " selected" : ""}`} onClick={() => setSelectedQuizSetId(quizSet.id)}>
                  <div className="card-body">
                    <h3>{quizSet.name}</h3>
                    <p className="help-text">{summarizeSourceNames(quizSet.sources)}</p>
                    {quizSet.description ? <p className="meta-text">{quizSet.description}</p> : null}
                  </div>
                </button>
              )
            })}
          </div>
        ) : null}
      </section>

      {selectedQuizSet ? (
        <section className="panel">
          <div className="panel-header">
            <span className="eyebrow">選択中</span>
            <h2>{selectedQuizSet.name}</h2>
          </div>

          <div className="summary-grid ready-grid">
            {selectedQuizSet.sources.map((source) => (
              <div key={source.dataSourceId} className="summary-card">
                <span className="list-label">準備完了</span>
                <strong>{source.dataSourceName}</strong>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {readySources.length > 0 ? <QuizRunner sources={readySources} /> : null}
    </section>
  )
}
