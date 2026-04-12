"use client"

import { useActionState, useState } from "react"

import { signIn, signUp, type AuthActionState } from "@/app/actions/auth-session"

const initialState: AuthActionState = {
  error: null,
}

export function AuthPanel() {
  const [mode, setMode] = useState<"signin" | "signup">("signin")
  const [signInState, signInAction, signInPending] = useActionState(signIn, initialState)
  const [signUpState, signUpAction, signUpPending] = useActionState(signUp, initialState)
  const state = mode === "signin" ? signInState : signUpState
  const isPending = mode === "signin" ? signInPending : signUpPending

  return (
    <section className="panel form-panel auth-panel">
      <div className="panel-header">
        <h2>{mode === "signin" ? "ログイン" : "新規登録"}</h2>
      </div>

      <div className="choice-group" role="tablist" aria-label="認証モード">
        <button type="button" className={`choice-chip${mode === "signin" ? " is-selected" : ""}`} onClick={() => setMode("signin")}>
          ログイン
        </button>
        <button type="button" className={`choice-chip${mode === "signup" ? " is-selected" : ""}`} onClick={() => setMode("signup")}>
          新規登録
        </button>
      </div>

      {mode === "signin" ? (
        <form action={signInAction} className="auth-form-grid">
          <label className="field">
            <span>メールアドレス</span>
            <input type="email" name="email" autoComplete="email" required />
          </label>
          <label className="field">
            <span>パスワード</span>
            <input type="password" name="password" autoComplete="current-password" required />
          </label>
          {state.error ? <p className="error-text">{state.error}</p> : null}
          <button type="submit" className="primary-button" disabled={isPending}>
            {isPending ? "ログイン中..." : "ログインする"}
          </button>
        </form>
      ) : (
        <form action={signUpAction} className="auth-form-grid">
          <label className="field">
            <span>表示名</span>
            <input type="text" name="displayName" autoComplete="nickname" />
          </label>
          <label className="field">
            <span>メールアドレス</span>
            <input type="email" name="email" autoComplete="email" required />
          </label>
          <label className="field">
            <span>パスワード</span>
            <input type="password" name="password" autoComplete="new-password" minLength={10} required />
          </label>
          <label className="field">
            <span>確認用パスワード</span>
            <input type="password" name="passwordConfirmation" autoComplete="new-password" minLength={10} required />
          </label>
          {state.error ? <p className="error-text">{state.error}</p> : null}
          <button type="submit" className="primary-button" disabled={isPending}>
            {isPending ? "作成中..." : "アカウントを作る"}
          </button>
        </form>
      )}
    </section>
  )
}
