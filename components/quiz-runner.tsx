/* eslint-disable @next/next/no-img-element */
"use client"

import { useState } from "react"

import { RichTextRenderer } from "@/components/rich-text-renderer"
import type { QuizQuestion, QuizSourceConfig } from "@/lib/notion/quiz-types"

type QuizRunnerProps = {
  sources: QuizSourceConfig[]
}

type QuizSession = {
  totalCandidates: number
  sourceCount: number
  questions: QuizQuestion[]
}

export function QuizRunner({ sources }: QuizRunnerProps) {
  const [questionCount, setQuestionCount] = useState(5)
  const [customQuestionCount, setCustomQuestionCount] = useState("")
  const [quiz, setQuiz] = useState<QuizSession | null>(null)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [hasRevealedAnswer, setHasRevealedAnswer] = useState(false)
  const [correctCount, setCorrectCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const currentQuestion = quiz?.questions[currentIndex] ?? null
  const isFinished = Boolean(quiz) && currentIndex >= (quiz?.questions.length ?? 0)

  const presetQuestionCounts = [5, 10, 20, 50, 100]

  function getStartQuestionCount() {
    const trimmed = customQuestionCount.trim()

    if (trimmed.length === 0) {
      return questionCount
    }

    const parsed = Number(trimmed)
    return Number.isInteger(parsed) && parsed > 0 ? parsed : questionCount
  }

  async function start() {
    const nextQuestionCount = getStartQuestionCount()

    setLoading(true)
    setError(null)
    setHasRevealedAnswer(false)
    setQuestionCount(nextQuestionCount)

    try {
      const response = await fetch("/api/notion/quiz/start", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          questionCount: nextQuestionCount,
          sources,
        }),
      })
      const payload = await response.json()

      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to start quiz")
      }

      setQuiz(payload)
      setCurrentIndex(0)
      setCorrectCount(0)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to start quiz")
    } finally {
      setLoading(false)
    }
  }

  async function submitAnswer(nextIsCorrect: boolean) {
    if (!currentQuestion || submitting) {
      return
    }

    setSubmitting(true)
    setError(null)

    const answeredQuestion = currentQuestion
    const sourceConfig = sources.find((source) => source.dataSourceId === answeredQuestion.dataSourceId)

    if (nextIsCorrect) {
      setCorrectCount((current) => current + 1)
    }

    goNext()

    try {
      const response = await fetch("/api/notion/quiz/answer", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          pageId: answeredQuestion.pageId,
          isCorrect: nextIsCorrect,
          mappings: sourceConfig?.mappings,
        }),
      })
      const payload = await response.json()

      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to record answer")
      }

    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to record answer")
    } finally {
      setSubmitting(false)
    }
  }

  function goNext() {
    setCurrentIndex((current) => current + 1)
    setHasRevealedAnswer(false)
  }

  return (
    <section className="panel quiz-panel">
      <div className="panel-header">
        <span className="eyebrow">出題</span>
        <h2>暗記カード</h2>
      </div>

      <div className="inline-stats">
        <span className="stat-chip">対象 {sources.length}</span>
        <span className="stat-chip">暗記カード</span>
      </div>

      <p className="help-text">
        {sources.length} 個のデータベースを束ねて、覚えていたかどうかを自己判定する暗記カードを生成します。
      </p>
      {error ? <p className="error-text">{error}</p> : null}

      {!quiz ? (
        <div className="quiz-config">
          <label className="field quiz-count-field">
            <span>一回の出題数</span>
            <div className="choice-group" role="radiogroup" aria-label="一回の出題数">
              {presetQuestionCounts.map((count) => {
                const isSelected = questionCount === count
                  && customQuestionCount.trim().length === 0

                return (
                  <button
                    key={count}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    className={`choice-chip${isSelected ? " is-selected" : ""}`}
                    onClick={() => setQuestionCount(count)}
                  >
                    {count} 問
                  </button>
                )
              })}
              <input
                type="number"
                min="1"
                inputMode="numeric"
                className="choice-input"
                value={customQuestionCount}
                onChange={(event) => {
                  const value = event.target.value
                  setCustomQuestionCount(value)

                  const parsed = Number(value)
                  if (Number.isInteger(parsed) && parsed > 0) {
                    setQuestionCount(parsed)
                  }
                }}
                placeholder="自由入力"
                aria-label="出題数を自由入力"
              />
            </div>
          </label>

          <button type="button" className="primary-button" onClick={start} disabled={loading}>
            {loading ? "準備中..." : "開始する"}
          </button>
        </div>
      ) : null}

      {quiz && !isFinished && currentQuestion ? (
        <div className="quiz-stage">
          <div className="quiz-stage-header">
            <span className="meta-text">
              問題 {currentIndex + 1} / {quiz.questions.length}
            </span>
            <span className="meta-text">候補 {quiz.totalCandidates} / 対象 {quiz.sourceCount}</span>
          </div>

          <div className="question-card">
            <div className="question-source">
              <span className="list-label">出典</span>
              <span className="meta-text">{currentQuestion.dataSourceName}</span>
            </div>
            <div className="question-copy">
              <RichTextRenderer items={currentQuestion.prompt} className="question-text" />
            </div>

            {currentQuestion.imageUrl ? (
              <img src={currentQuestion.imageUrl} alt="" className="question-image" />
            ) : null}
          </div>

          <div className="flashcard-actions">
            {!hasRevealedAnswer ? (
              <button
                type="button"
                className="primary-button flashcard-button flashcard-reveal-button"
                onClick={() => setHasRevealedAnswer(true)}
              >
                答えを見る
              </button>
            ) :
              <div className="flashcard-actions answer-actions">
                <button
                  type="button"
                  className="ghost-button flashcard-button"
                  disabled={submitting}
                  onClick={() => submitAnswer(false)}
                >
                  覚えていない
                </button>
                <button
                  type="button"
                  className="primary-button flashcard-button"
                  disabled={submitting}
                  onClick={() => submitAnswer(true)}
                >
                  覚えていた
                </button>
              </div>
            }
          </div>

          {hasRevealedAnswer ? (
            <div className="answer-panel">
              <div className="answer-detail">
                <strong>答え</strong>
                <RichTextRenderer items={currentQuestion.correctAnswer} />
              </div>

              <div className="answer-detail">
                <strong>付加情報</strong>
                {currentQuestion.explanation.length > 0 ? (
                  <RichTextRenderer items={currentQuestion.explanation} />
                ) : (
                  <span className="meta-text">なし</span>
                )}
              </div>

              {currentQuestion.imageUrl ? (
                <img src={currentQuestion.imageUrl} alt="" className="question-image" />
              ) : null}

            </div>
          ) : null}
        </div>
      ) : null}

      {quiz && isFinished ? (
        <div className="quiz-finished">
          <div className="summary-grid">
            <div className="summary-card">
              <span className="eyebrow">正解数</span>
              <strong>
                {correctCount} / {quiz.questions.length}
              </strong>
            </div>
            <div className="summary-card">
              <span className="eyebrow">正答率</span>
              <strong>
                {quiz.questions.length > 0 ? Math.round((correctCount / quiz.questions.length) * 100) : 0}%
              </strong>
            </div>
            <div className="summary-card">
              <span className="eyebrow">対象数</span>
              <strong>{quiz.sourceCount}</strong>
            </div>
          </div>
          <button
            type="button"
            className="primary-button"
            onClick={() => {
              setQuiz(null)
              setCurrentIndex(0)
              setHasRevealedAnswer(false)
              setCorrectCount(0)
            }}
          >
            もう一度はじめる
          </button>
        </div>
      ) : null}
    </section>
  )
}
