/* eslint-disable @next/next/no-img-element */
"use client"

import { useEffect, useRef, useState } from "react"

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
  const [hasAnswered, setHasAnswered] = useState(false)
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null)
  const [correctCount, setCorrectCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const nextButtonRef = useRef<HTMLButtonElement | null>(null)

  const currentQuestion = quiz?.questions[currentIndex] ?? null
  const isFinished = Boolean(quiz) && currentIndex >= (quiz?.questions.length ?? 0)

  useEffect(() => {
    if (!hasAnswered || !nextButtonRef.current) {
      return
    }

    if (typeof window !== "undefined" && window.matchMedia("(pointer: fine)").matches) {
      nextButtonRef.current.focus()
    }
  }, [hasAnswered])

  async function start() {
    setLoading(true)
    setError(null)
    setHasAnswered(false)
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

  async function submitAnswer(nextIsCorrect: boolean) {
    if (!currentQuestion || hasAnswered || submitting) {
      return
    }

    setHasAnswered(true)
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
    setHasAnswered(false)
    setIsCorrect(null)
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
            {!hasAnswered ? (
              <>
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
              </>
            ) : (
              <button
                type="button"
                className="primary-button flashcard-button flashcard-next-button"
                ref={nextButtonRef}
                onClick={goNext}
              >
                次の問題へ
              </button>
            )}
          </div>

          {hasAnswered ? (
            <div className="answer-panel">
              <div className="answer-result">
                <span className={isCorrect ? "ok-pill" : "warn-pill"}>
                  {isCorrect ? "覚えていた" : "覚えていなかった"}
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
              setHasAnswered(false)
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
