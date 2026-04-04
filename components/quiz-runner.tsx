/* eslint-disable @next/next/no-img-element */
"use client"

import { useEffect, useMemo, useRef, useState } from "react"

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
  const [quiz, setQuiz] = useState<QuizSession | null>(null)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null)
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null)
  const [correctCount, setCorrectCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const nextButtonRef = useRef<HTMLButtonElement | null>(null)

  const currentQuestion = quiz?.questions[currentIndex] ?? null
  const isFinished = Boolean(quiz) && currentIndex >= (quiz?.questions.length ?? 0)

  const correctOptionId = useMemo(() => {
    if (!currentQuestion) {
      return null
    }

    return currentQuestion.options.find((option) => option.pageId === currentQuestion.pageId)?.id ?? null
  }, [currentQuestion])

  useEffect(() => {
    if (!selectedOptionId || !nextButtonRef.current) {
      return
    }

    if (typeof window !== "undefined" && window.matchMedia("(pointer: fine)").matches) {
      nextButtonRef.current.focus()
    }
  }, [selectedOptionId])

  async function start() {
    setLoading(true)
    setError(null)
    setSelectedOptionId(null)
    setIsCorrect(null)

    try {
      const response = await fetch("/api/notion/quiz/start", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          questionCount,
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

  async function submitAnswer(optionId: string, optionPageId: string) {
    if (!currentQuestion || selectedOptionId || submitting) {
      return
    }

    const nextIsCorrect = optionPageId === currentQuestion.pageId
    setSelectedOptionId(optionId)
    setIsCorrect(nextIsCorrect)
    setSubmitting(true)
    setError(null)

    if (nextIsCorrect) {
      setCorrectCount((current) => current + 1)
    }

    const sourceConfig = sources.find((source) => source.dataSourceId === currentQuestion.dataSourceId)

    try {
      const response = await fetch("/api/notion/quiz/answer", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          pageId: currentQuestion.pageId,
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
    setSelectedOptionId(null)
    setIsCorrect(null)
  }

  return (
    <section className="panel quiz-panel">
      <div className="panel-header">
        <span className="eyebrow">出題</span>
        <h2>Quiz Runner</h2>
      </div>

      <div className="inline-stats">
        <span className="stat-chip">source {sources.length}</span>
        <span className="stat-chip">4 択</span>
      </div>

      <p className="help-text">{sources.length} 個の data source を束ねて 4 択クイズを生成します。</p>
      {error ? <p className="error-text">{error}</p> : null}

      {!quiz ? (
        <div className="quiz-config">
          <label className="field quiz-count-field">
            <span>一回の出題数</span>
            <select value={questionCount} onChange={(event) => setQuestionCount(Number(event.target.value))}>
              {[3, 5, 10, 15].map((count) => (
                <option key={count} value={count}>
                  {count} 問
                </option>
              ))}
            </select>
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
            <span className="meta-text">候補 {quiz.totalCandidates} / source {quiz.sourceCount}</span>
          </div>

          <div className="question-card">
            <div className="question-source">
              <span className="list-label">source</span>
              <span className="meta-text">{currentQuestion.dataSourceName}</span>
            </div>
            <div className="question-copy">
              <RichTextRenderer items={currentQuestion.prompt} className="question-text" />
            </div>

            {currentQuestion.imageUrl ? (
              <img src={currentQuestion.imageUrl} alt="" className="question-image" />
            ) : null}
          </div>

          <div className="options-grid">
            {currentQuestion.options.map((option, index) => {
              const wasChosen = selectedOptionId === option.id
              const isCorrectOption = correctOptionId === option.id
              const statusClass = !selectedOptionId
                ? ""
                : isCorrectOption
                  ? " is-correct"
                  : wasChosen
                    ? " is-wrong"
                    : ""

              return (
                <button
                  key={option.id}
                  type="button"
                  className={`option-card${statusClass}`}
                  disabled={Boolean(selectedOptionId)}
                  onClick={() => submitAnswer(option.id, option.pageId)}
                >
                  <span className="option-index">{String.fromCharCode(65 + index)}</span>
                  <RichTextRenderer items={option.answer} />
                </button>
              )
            })}
          </div>

          {selectedOptionId ? (
            <div className="answer-panel">
              <div className="answer-result">
                <span className={isCorrect ? "ok-pill" : "warn-pill"}>
                  {isCorrect ? "正解" : "不正解"}
                </span>
              </div>

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

              <button ref={nextButtonRef} type="button" className="primary-button" onClick={goNext}>
                次の問題へ
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {quiz && isFinished ? (
        <div className="quiz-finished">
          <div className="summary-grid">
            <div className="summary-card">
              <span className="eyebrow">Score</span>
              <strong>
                {correctCount} / {quiz.questions.length}
              </strong>
            </div>
            <div className="summary-card">
              <span className="eyebrow">Accuracy</span>
              <strong>
                {quiz.questions.length > 0 ? Math.round((correctCount / quiz.questions.length) * 100) : 0}%
              </strong>
            </div>
            <div className="summary-card">
              <span className="eyebrow">Sources</span>
              <strong>{quiz.sourceCount}</strong>
            </div>
          </div>
          <button
            type="button"
            className="primary-button"
            onClick={() => {
              setQuiz(null)
              setCurrentIndex(0)
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
