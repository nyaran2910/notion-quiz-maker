"use client"

import { useActionState } from "react"

import {
  connectNotion,
  type NotionSessionActionState,
} from "@/app/actions/notion-session"

const initialState: NotionSessionActionState = {
  error: null,
}

export function NotionTokenForm() {
  const [state, formAction, isPending] = useActionState(connectNotion, initialState)

  return (
    <form action={formAction} className="panel auth-panel settings-panel">
      <div className="panel-header">
        <h2>Notion API キー</h2>
      </div>

      <p className="help-text">Notion と接続するための内部インテグレーションキーを登録します。</p>

      <div className="auth-form-grid">
        <label className="field">
          <span>API キー</span>
          <input
            type="password"
            name="token"
            placeholder="secret_xxx or ntn_xxx"
            autoComplete="off"
            spellCheck={false}
            required
          />
        </label>

        {state.error ? <p className="error-text">{state.error}</p> : null}

        <button type="submit" className="primary-button" disabled={isPending}>
          {isPending ? "更新中..." : "更新"}
        </button>
      </div>
    </form>
  )
}
