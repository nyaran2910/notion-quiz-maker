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
    <form action={formAction} className="panel form-panel">
      <div className="panel-header">
        <span className="eyebrow">Step 1</span>
        <h2>Connect Your Notion</h2>
      </div>

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
        {isPending ? "Connecting..." : "Connect"}
      </button>
    </form>
  )
}
