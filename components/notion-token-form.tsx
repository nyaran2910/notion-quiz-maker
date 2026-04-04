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
    <form action={formAction} className="panel form-panel auth-panel">
      <div className="panel-header">
        <span className="eyebrow">接続</span>
        <h2>Notion を接続する</h2>
      </div>

      <p className="help-text">
        Internal Integration Token を入力すると、接続状態を保存してこのまま設定と出題に進めます。
      </p>

      <label className="field">
        <span>Internal Integration Token</span>
        <input
          type="password"
          name="token"
          placeholder="secret_xxx or ntn_xxx"
          autoComplete="off"
          spellCheck={false}
          required
        />
      </label>

      <p className="help-text">
        トークンはサーバー側の HttpOnly cookie に保存し、ブラウザ JavaScript からは参照させません。
      </p>

      {state.error ? <p className="error-text">{state.error}</p> : null}

      <button type="submit" className="primary-button" disabled={isPending}>
        {isPending ? "接続中..." : "接続する"}
      </button>
    </form>
  )
}
