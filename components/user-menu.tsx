"use client"

import { useEffect, useState, useSyncExternalStore } from "react"
import { createPortal } from "react-dom"

import { AccountSettingsPanel } from "@/components/account-settings-panel"

type UserMenuProps = {
  email: string | null
  displayName: string | null
}

export function UserMenu({ email, displayName }: UserMenuProps) {
  const label = displayName ?? email ?? "ユーザー"
  const [open, setOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const mounted = useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false
  )

  useEffect(() => {
    function syncIsMobile() {
      setIsMobile(window.innerWidth <= 768)
    }

    syncIsMobile()
    window.addEventListener("resize", syncIsMobile)

    return () => {
      window.removeEventListener("resize", syncIsMobile)
    }
  }, [])

  useEffect(() => {
    if (!open) {
      return
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false)
      }
    }

    document.addEventListener("keydown", handleEscape)

    return () => {
      document.removeEventListener("keydown", handleEscape)
    }
  }, [open])

  return (
    <>
      <button type="button" className="site-user-trigger" onClick={() => setOpen(true)}>
        <span className="site-user-avatar" aria-hidden="true">
          {label.slice(0, 1).toUpperCase()}
        </span>
        <span className="site-user-text">{label}</span>
      </button>

      {open && !isMobile ? (
        <div className="user-modal" role="dialog" aria-modal="true" aria-label="ユーザー設定">
          <button type="button" className="user-modal-backdrop" aria-label="閉じる" onClick={() => setOpen(false)} />

          <div className="user-modal-panel">
            <div className="user-modal-header">
              <div>
                <p className="eyebrow">ユーザー設定</p>
                <strong>{label}</strong>
                {email ? <p className="meta-text">{email}</p> : null}
              </div>

              <button type="button" className="ghost-button user-modal-close" onClick={() => setOpen(false)}>
                閉じる
              </button>
            </div>

            <AccountSettingsPanel email={email} displayName={displayName} />
          </div>
        </div>
      ) : null}

      {mounted && open && isMobile ? createPortal(
        <div className="user-modal" role="dialog" aria-modal="true" aria-label="ユーザー設定">
          <button type="button" className="user-modal-backdrop" aria-label="閉じる" onClick={() => setOpen(false)} />

          <div className="user-modal-panel">
            <div className="user-modal-header">
              <div>
                <p className="eyebrow">ユーザー設定</p>
                <strong>{label}</strong>
                {email ? <p className="meta-text">{email}</p> : null}
              </div>

              <button type="button" className="ghost-button user-modal-close" onClick={() => setOpen(false)}>
                閉じる
              </button>
            </div>

            <AccountSettingsPanel email={email} displayName={displayName} />
          </div>
        </div>
      , document.body) : null}
    </>
  )
}
