/* eslint-disable @next/next/no-img-element */
"use client"

import { useCallback, useEffect, useRef, useState } from "react"

import { RichTextRenderer } from "@/components/rich-text-renderer"
import type { QuizQuestion, QuizSourceConfig } from "@/lib/notion/quiz-types"

type QuizRunnerProps = {
  sources: QuizSourceConfig[]
}

type QuizSession = {
  sessionId: string | null
  quizSetId: string | null
  plannedQuestionCount: number
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
  const [questionShownAt, setQuestionShownAt] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [endingSession, setEndingSession] = useState(false)
  const [endedSessionId, setEndedSessionId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const nextQuestionRequestRef = useRef<Promise<void> | null>(null)
  const nextQuestionIndexRef = useRef<number | null>(null)
  const stageScrollRef = useRef<HTMLDivElement | null>(null)
  const answerPanelRef = useRef<HTMLDivElement | null>(null)

  const currentQuestion = quiz?.questions[currentIndex] ?? null
  const isFinished = Boolean(quiz) && currentIndex >= (quiz?.plannedQuestionCount ?? 0)

  const presetQuestionCounts = [5, 10, 20, 50, 100]

  function getStartQuestionCount() {
    const trimmed = customQuestionCount.trim()

    if (trimmed.length === 0) {
      return questionCount
    }

    const parsed = Number(trimmed)
    return Number.isInteger(parsed) && parsed > 0 ? parsed : questionCount
  }

  useEffect(() => {
    if (!quiz || !currentQuestion || isFinished) {
      return
    }

    setQuestionShownAt(Date.now())
  }, [quiz, currentQuestion, isFinished])

  useEffect(() => {
    if (!currentQuestion || isFinished) {
      return
    }

    if (stageScrollRef.current) {
      stageScrollRef.current.scrollTop = 0
    }
  }, [currentQuestion, isFinished])

  useEffect(() => {
    if (!hasRevealedAnswer) {
      return
    }

    const container = stageScrollRef.current
    const answerPanel = answerPanelRef.current

    if (!container || !answerPanel) {
      return
    }

    const containerTop = container.getBoundingClientRect().top
    const answerTop = answerPanel.getBoundingClientRect().top
    const nextTop = container.scrollTop + (answerTop - containerTop) - 12

    container.scrollTo({ top: Math.max(0, nextTop), behavior: "smooth" })
  }, [hasRevealedAnswer])

  const prefetchNextQuestion = useCallback(async (sessionId: string, questionIndex: number, plannedQuestionCount: number) => {
    const nextIndex = questionIndex + 1

    if (nextIndex >= plannedQuestionCount) {
      return
    }

    if (quiz?.questions[nextIndex]) {
      return
    }

    if (nextQuestionIndexRef.current === nextIndex && nextQuestionRequestRef.current) {
      await nextQuestionRequestRef.current
      return
    }

    const request = (async () => {
      const nextResponse = await fetch("/api/notion/quiz/next", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sessionId,
        }),
      })
      const nextPayload = await nextResponse.json()

      if (!nextResponse.ok) {
        throw new Error(nextPayload.error ?? "Failed to load next question")
      }

      if (nextPayload.question) {
        setQuiz((currentQuiz) => {
          if (!currentQuiz || currentQuiz.questions[nextIndex]) {
            return currentQuiz
          }

          return {
            ...currentQuiz,
            questions: [...currentQuiz.questions, nextPayload.question as QuizQuestion],
          }
        })
      } else {
        setQuiz((currentQuiz) => currentQuiz ? {
          ...currentQuiz,
          plannedQuestionCount: Math.min(currentQuiz.plannedQuestionCount, nextIndex),
        } : currentQuiz)
      }
    })()

    nextQuestionIndexRef.current = nextIndex
    nextQuestionRequestRef.current = request

    try {
      await request
    } finally {
      if (nextQuestionIndexRef.current === nextIndex) {
        nextQuestionIndexRef.current = null
        nextQuestionRequestRef.current = null
      }
    }
  }, [quiz?.questions])

  useEffect(() => {
    if (!quiz?.sessionId || !currentQuestion || isFinished) {
      return
    }

    void prefetchNextQuestion(quiz.sessionId, currentIndex, quiz.plannedQuestionCount).catch((requestError) => {
      setError(requestError instanceof Error ? requestError.message : "Failed to load next question")
    })
  }, [currentIndex, currentQuestion, isFinished, prefetchNextQuestion, quiz])

  useEffect(() => {
    const sessionId = quiz?.sessionId ?? null

    if (!sessionId || !isFinished || endingSession || endedSessionId === sessionId) {
      return
    }

    let cancelled = false

    async function finalizeSession() {
      setEndingSession(true)

      try {
        const response = await fetch("/api/notion/quiz/end", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            sessionId,
          }),
        })
        const payload = await response.json()

        if (!response.ok) {
          throw new Error(payload.error ?? "Failed to end quiz session")
        }

        if (!cancelled) {
          setEndedSessionId(sessionId)
        }
      } catch (requestError) {
        if (!cancelled) {
          setError(requestError instanceof Error ? requestError.message : "Failed to end quiz session")
        }
      } finally {
        if (!cancelled) {
          setEndingSession(false)
        }
      }
    }

    void finalizeSession()

    return () => {
      cancelled = true
    }
  }, [endedSessionId, endingSession, isFinished, quiz])

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
        nextQuestionIndexRef.current = null
        nextQuestionRequestRef.current = null
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
    const activeQuiz = quiz

    if (!activeQuiz) {
      return
    }

    const sourceConfig = sources.find((source) => source.dataSourceId === answeredQuestion.dataSourceId)
    const responseTimeMs = questionShownAt ? Math.max(0, Date.now() - questionShownAt) : null
    const shouldPrefetchNext = Boolean(activeQuiz.sessionId && currentIndex + 1 < activeQuiz.plannedQuestionCount)

    if (nextIsCorrect) {
      setCorrectCount((current) => current + 1)
    }

    goNext()
    setSubmitting(false)

    if (shouldPrefetchNext) {
      void prefetchNextQuestion(activeQuiz.sessionId as string, currentIndex, activeQuiz.plannedQuestionCount).catch((requestError) => {
        setError(requestError instanceof Error ? requestError.message : "Failed to load next question")
      })
    }

    void (async () => {
      try {
        const response = await fetch("/api/notion/quiz/answer", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            pageId: answeredQuestion.pageId,
            questionItemId: answeredQuestion.questionItemId,
            sessionId: activeQuiz.sessionId,
            isCorrect: nextIsCorrect,
            questionPosition: currentIndex + 1,
            responseTimeMs,
            mappings: sourceConfig?.mappings,
          }),
        })
        const payload = await response.json()

        if (!response.ok) {
          throw new Error(payload.error ?? "Failed to record answer")
        }
      } catch (requestError) {
        setError(requestError instanceof Error ? requestError.message : "Failed to record answer")
      }
    })()
  }

  function goNext() {
    setCurrentIndex((current) => current + 1)
    setHasRevealedAnswer(false)
    setQuestionShownAt(null)
  }

  if (quiz && !isFinished) {
    return (
      <section className="quiz-stage-shell">
        <div className="quiz-stage-header quiz-stage-toolbar">
          <div className="quiz-stage-progress">
            <span className="eyebrow">問題 {Math.min(currentIndex + 1, quiz.plannedQuestionCount)} / {quiz.plannedQuestionCount}</span>
            <span className="meta-text">候補 {quiz.totalCandidates} / 対象 {quiz.sourceCount}</span>
          </div>
          {currentQuestion ? (
            <div className="question-source quiz-stage-source">
              <span className="list-label">出典</span>
              <span className="meta-text">{currentQuestion.dataSourceName}</span>
            </div>
          ) : null}
        </div>

        <div ref={stageScrollRef} className="quiz-stage-scroll">
          {error ? <p className="error-text">{error}</p> : null}
          {currentQuestion ? (
            <>
              <div className="question-card quiz-question-card">
                <div className="question-copy">
                  <RichTextRenderer items={currentQuestion.prompt} className="question-text" />
                </div>
              </div>

              {hasRevealedAnswer ? (
                <div ref={answerPanelRef} className="answer-panel quiz-answer-panel">
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

                  {currentQuestion.imageUrls.length > 0 ? (
                    <div className="quiz-answer-images">
                      {currentQuestion.imageUrls.map((imageUrl) => (
                        <img key={imageUrl} src={imageUrl} alt="" className="question-image quiz-answer-image" />
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </>
          ) : (
            <div className="quiz-stage-loading">
              <p className="status-text">次の問題を読み込み中...</p>
            </div>
          )}
        </div>

        <div className="quiz-stage-actions">
          {!hasRevealedAnswer ? (
            <button
              type="button"
              className="primary-button flashcard-button flashcard-reveal-button"
              disabled={!currentQuestion}
              onClick={() => setHasRevealedAnswer(true)}
            >
              答えを見る
            </button>
          ) : (
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
          )}
        </div>
      </section>
    )
  }

  return (
    <section className="panel quiz-panel">
      <div className="panel-header">
        <h2>暗記カード</h2>
      </div>


      {error ? <p className="error-text">{error}</p> : null}

      {!quiz ? (
        <div className="quiz-config">
          <label className="field quiz-count-field">
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

      {quiz && isFinished ? (
        <div className="quiz-finished">
          <div className="summary-grid">
            <div className="summary-card">
              <span className="eyebrow">正解数</span>
              <strong>
                 {correctCount} / {quiz.plannedQuestionCount}
              </strong>
            </div>
            <div className="summary-card">
              <span className="eyebrow">正答率</span>
              <strong>
                 {quiz.plannedQuestionCount > 0 ? Math.round((correctCount / quiz.plannedQuestionCount) * 100) : 0}%
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
              setEndedSessionId(null)
              setEndingSession(false)
              nextQuestionIndexRef.current = null
              nextQuestionRequestRef.current = null
            }}
          >
            もう一度はじめる
          </button>
        </div>
      ) : null}
    </section>
  )
}
