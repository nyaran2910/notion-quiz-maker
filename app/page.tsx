import { NotionTokenForm } from "@/components/notion-token-form"
import { SetupWorkspace } from "@/components/setup-workspace"
import { getSessionProfile } from "@/lib/notion/api"

export const dynamic = "force-dynamic"

export default async function Page() {
  const profile = await getSessionProfile()

  return (
    <main className="page shell">
      <section className="hero">
        <span className="eyebrow">Notion Quiz Builder</span>
        <h1>Connect a workspace, inspect your quiz schema, and prepare a target data source.</h1>
        <p className="hero-copy">
          この画面では、ユーザー自身の Notion integration token を使って接続し、クイズ対象にする
          data source を選択します。
        </p>
      </section>

      {profile ? (
        <SetupWorkspace workspaceName={profile.workspaceName} />
      ) : (
        <NotionTokenForm />
      )}
    </main>
  )
}
