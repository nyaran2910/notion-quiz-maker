import { redirect } from "next/navigation"

import { QuizWorkspace } from "@/components/quiz-workspace"
import { SiteFooterNav, SiteHeader } from "@/components/site-shell"
import { getCurrentUser } from "@/lib/auth/user"
import { getSessionProfile } from "@/lib/notion/api"

export const dynamic = "force-dynamic"

export default async function QuizPage() {
  const user = await getCurrentUser()

  if (!user) {
    redirect("/login")
  }

  const profile = await getSessionProfile()

  if (!profile) {
    redirect("/setup")
  }

  return (
    <main className="page shell">
      <SiteHeader current="quiz" userEmail={user?.email} userDisplayName={user?.displayName} />

      <QuizWorkspace />

      <SiteFooterNav current="quiz" />
    </main>
  )
}
