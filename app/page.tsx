import Link from "next/link"

import { NotionTokenForm } from "@/components/notion-token-form"
import { SiteFooterNav, SiteHeader } from "@/components/site-shell"
import { getSessionProfile } from "@/lib/notion/api"

export const dynamic = "force-dynamic"

export default async function Page() {
  const profile = await getSessionProfile()

  return (
    <main className="page shell">
      <SiteHeader current="home" />

      <section className="hero home-hero">
        <div className="hero-label-row">
          <span className="eyebrow">ホーム</span>
          <span className="hero-chip">PC / スマホ対応</span>
        </div>
        <h1>Notion クイズ</h1>
        <p className="hero-copy">
          NotionのDB機能を使って自作クイズを作ってみよう！
        </p>
      </section>

      {profile ? (
        <section className="nav-grid ankilot-grid">
          <Link href="/setup" className="nav-card ankilot-card">
            <span className="list-label">つくる</span>
            <h2>設定</h2>
            <p className="help-text">対象のデータベースの選択、必須プロパティのマッピングを行います。</p>
          </Link>

          <Link href="/quiz" className="nav-card ankilot-card">
            <span className="list-label">おぼえる</span>
            <h2>クイズ</h2>
            <p className="help-text">複数のソースを横断した 4 択クイズを実行します。</p>
          </Link>
        </section>
      ) : (
        <NotionTokenForm />
      )}

      <SiteFooterNav current="home" />
    </main>
  )
}
