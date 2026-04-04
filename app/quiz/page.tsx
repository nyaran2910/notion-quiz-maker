import { NotionTokenForm } from "@/components/notion-token-form"
import { QuizWorkspace } from "@/components/quiz-workspace"
import { SiteFooterNav, SiteHeader } from "@/components/site-shell"
import { getSessionProfile } from "@/lib/notion/api"

export const dynamic = "force-dynamic"

export default async function QuizPage() {
  const profile = await getSessionProfile()

  return (
    <main className="page shell">
      <SiteHeader current="quiz" />

      {profile ? <QuizWorkspace /> : <NotionTokenForm />}

      <SiteFooterNav current="quiz" />
    </main>
  )
}
