"use client"

import { useActionState } from "react"

import {
  deleteAccount,
  signOut,
  updateAccountPassword,
  updateAccountProfile,
} from "@/app/actions/auth-session"
import { NotionTokenForm } from "@/components/notion-token-form"
import { initialAccountState } from "@/lib/auth/account-action-state"

type AccountSettingsPanelProps = {
  email: string | null
  displayName: string | null
}

export function AccountSettingsPanel({ email, displayName }: AccountSettingsPanelProps) {
  const [profileState, profileAction, profilePending] = useActionState(updateAccountProfile, initialAccountState)
  const [passwordState, passwordAction, passwordPending] = useActionState(updateAccountPassword, initialAccountState)
  const [deleteState, deleteAction, deletePending] = useActionState(deleteAccount, initialAccountState)

  return (
    <section className="settings-stack">
      <NotionTokenForm />

      <section className="panel settings-panel">
        <div className="panel-header">
          <h2>アカウント</h2>
        </div>

        <form action={profileAction} className="auth-form-grid">
          <label className="field">
            <span>ユーザー名</span>
            <input type="text" name="displayName" defaultValue={displayName ?? ""} />
          </label>

          <label className="field">
            <span>メールアドレス</span>
            <input type="email" name="email" defaultValue={email ?? ""} required />
          </label>

          {profileState.error ? <p className="error-text">{profileState.error}</p> : null}
          {profileState.success ? <p className="success-text">{profileState.success}</p> : null}

          <button type="submit" className="primary-button" disabled={profilePending}>
            {profilePending ? "更新中..." : "更新"}
          </button>
        </form>
      </section>

      <section className="panel settings-panel">
        <div className="panel-header">
          <h2>パスワード</h2>
        </div>

        <form action={passwordAction} className="auth-form-grid">
          <label className="field">
            <span>現在のパスワード</span>
            <input type="password" name="currentPassword" autoComplete="current-password" required />
          </label>

          <label className="field">
            <span>新しいパスワード</span>
            <input type="password" name="newPassword" autoComplete="new-password" minLength={10} required />
          </label>

          <label className="field">
            <span>確認用パスワード</span>
            <input type="password" name="passwordConfirmation" autoComplete="new-password" minLength={10} required />
          </label>

          {passwordState.error ? <p className="error-text">{passwordState.error}</p> : null}
          {passwordState.success ? <p className="success-text">{passwordState.success}</p> : null}

          <button type="submit" className="primary-button" disabled={passwordPending}>
            {passwordPending ? "更新中..." : "変更"}
          </button>
        </form>
      </section>

      <section className="panel settings-panel">
        <div className="panel-header">
          <h2>セッション</h2>
        </div>

        <div className="settings-actions">
          <form action={signOut}>
            <button type="submit" className="ghost-button">ログアウト</button>
          </form>
        </div>
      </section>

      <section className="panel settings-panel danger-panel">
        <div className="panel-header">
          <h2>アカウント削除</h2>
        </div>

        <p className="help-text">削除するとアカウント情報は元に戻せません。確認のため `DELETE` と入力してください。</p>

        <form action={deleteAction} className="auth-form-grid">
          <label className="field">
            <span>確認</span>
            <input type="text" name="confirmation" placeholder="DELETE" required />
          </label>

          {deleteState.error ? <p className="error-text">{deleteState.error}</p> : null}

          <button type="submit" className="danger-button" disabled={deletePending}>
            {deletePending ? "削除中..." : "アカウント削除"}
          </button>
        </form>
      </section>
    </section>
  )
}
