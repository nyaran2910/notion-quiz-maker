import { redirect } from "next/navigation"

import { SetupWorkspace } from "@/components/setup-workspace"
import { SiteFooterNav, SiteHeader } from "@/components/site-shell"
import { getCurrentUser } from "@/lib/auth/user"
import { getSessionProfile } from "@/lib/notion/api"

export const dynamic = "force-dynamic"

export default async function SetupPage() {
  const user = await getCurrentUser()

  if (!user) {
    redirect("/login")
  }

  const profile = await getSessionProfile()

  return (
    <main className="page shell">
      <SiteHeader current="setup" userEmail={user?.email} userDisplayName={user?.displayName} />

      {profile ? (
        <SetupWorkspace workspaceName={profile.workspaceName} />
      ) : (
        <section className="panel settings-panel">
          <div className="panel-header">
            <h2>Notion 接続が必要です</h2>
          </div>
          <p className="help-text">右上のユーザー表示を押してユーザー設定を開き、`Notion API キー` を登録してください。</p>
        </section>
      )}

      <SiteFooterNav current="setup" />
    </main>
  )
}
