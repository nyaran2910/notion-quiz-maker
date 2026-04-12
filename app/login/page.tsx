import { redirect } from "next/navigation"

import { AuthPanel } from "@/components/auth-panel"
import { getCurrentUser } from "@/lib/auth/user"

export const dynamic = "force-dynamic"

export default async function LoginPage() {
  const user = await getCurrentUser()

  if (user) {
    redirect("/")
  }

  return (
    <main className="auth-page">
      <section className="auth-page-card">
        <div className="auth-page-brand">
          <span className="site-app-icon" aria-hidden="true">
            NQ
          </span>
          <h1>Notion Quiz</h1>
        </div>

        <AuthPanel />
      </section>
    </main>
  )
}
