import Link from "next/link"

type SiteShellProps = {
  current: "home" | "setup" | "quiz"
}

const items = [
  { href: "/", label: "ホーム", key: "home" },
  { href: "/setup", label: "設定", key: "setup" },
  { href: "/quiz", label: "クイズ", key: "quiz" },
] as const

export function SiteHeader({ current }: SiteShellProps) {
  return (
    <header className="site-header">
      <div className="site-brand">
        <Link href="/" className="site-logo">
          ノーション暗記カード
        </Link>
        <p className="site-tagline">シンプルに続けられる暗記学習ワークスペース</p>
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
