import { NotionTokenForm } from "@/components/notion-token-form"
import { SetupWorkspace } from "@/components/setup-workspace"
import { SiteFooterNav, SiteHeader } from "@/components/site-shell"
import { getSessionProfile } from "@/lib/notion/api"

export const dynamic = "force-dynamic"

export default async function SetupPage() {
  const profile = await getSessionProfile()

  return (
    <main className="page shell">
      <SiteHeader current="setup" />

      {profile ? <SetupWorkspace workspaceName={profile.workspaceName} /> : <NotionTokenForm />}

      <SiteFooterNav current="setup" />
    </main>
  )
}
