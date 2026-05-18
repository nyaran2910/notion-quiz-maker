import Link from "next/link"

import { UserMenu } from "@/components/user-menu"

type SiteShellProps = {
  current?: "setup" | "quiz"
  userEmail?: string | null
  userDisplayName?: string | null
}

const items = [
  { href: "/setup", label: "設定", key: "setup" },
  { href: "/quiz", label: "クイズ", key: "quiz" },
] as const

export function SiteHeader({ current, userEmail, userDisplayName }: SiteShellProps) {
  return (
    <header className="site-header">
      <div className="site-brand-wrap">
        <span className="site-app-icon" aria-hidden="true">
          NQ
        </span>
        <Link href="/quiz" className="site-logo">
          Notion Quiz
        </Link>
      </div>

      <nav className="site-nav" aria-label="全体ナビゲーション">
        {items.map((item) => (
          <Link
            key={item.key}
            href={item.href}
            className={`site-nav-link${current === item.key ? " is-current" : ""}`}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      <div className="site-account-slot">
        {userEmail || userDisplayName ? (
          <UserMenu email={userEmail ?? null} displayName={userDisplayName ?? null} />
        ) : null}
      </div>
    </header>
  )
}

export function SiteFooterNav({ current }: SiteShellProps) {
  return (
    <nav className="footer-tabs" aria-label="メインナビゲーション">
      {items.map((item) => (
        <Link
          key={item.key}
          href={item.href}
          className={`footer-tab${current === item.key ? " is-current" : ""}`}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  )
}
