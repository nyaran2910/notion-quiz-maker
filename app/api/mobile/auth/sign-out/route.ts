import { cookies } from "next/headers"

import { APP_SESSION_COOKIE } from "@/lib/auth/session"
import { withTransaction } from "@/lib/db/client"
import { authSessionsRepository } from "@/lib/db/repositories/auth-sessions"
import { jsonNoStore, verifySameOrigin } from "@/lib/http"
import { NOTION_TOKEN_COOKIE } from "@/lib/notion/session"

export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  try {
    if (!verifySameOrigin(request)) {
      return jsonNoStore({ error: "Forbidden origin" }, { status: 403 })
    }

    const cookieStore = await cookies()
    const sessionId = cookieStore.get(APP_SESSION_COOKIE)?.value

    if (sessionId) {
      await withTransaction((client) => authSessionsRepository.deleteById(client, sessionId))
    }

    cookieStore.delete(APP_SESSION_COOKIE)
    cookieStore.delete(NOTION_TOKEN_COOKIE)

    return jsonNoStore({ ok: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : "ログアウトに失敗しました。"
    return jsonNoStore({ error: message }, { status: 500 })
  }
}
