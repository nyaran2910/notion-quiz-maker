import { cookies } from "next/headers"

import { APP_SESSION_COOKIE, APP_SESSION_COOKIE_OPTIONS, APP_SESSION_MAX_AGE_SECONDS } from "@/lib/auth/session"
import { verifyPassword } from "@/lib/auth/password"
import { decryptString } from "@/lib/crypto"
import { withTransaction } from "@/lib/db/client"
import { authSessionsRepository } from "@/lib/db/repositories/auth-sessions"
import { notionConnectionsRepository } from "@/lib/db/repositories/notion-connections"
import { usersRepository, type UserRecord } from "@/lib/db/repositories/users"
import { jsonNoStore, verifySameOrigin } from "@/lib/http"
import { NOTION_TOKEN_COOKIE, NOTION_TOKEN_COOKIE_OPTIONS } from "@/lib/notion/session"

export const dynamic = "force-dynamic"

type SignInPayload = {
  email?: string
  password?: string
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase()
}

function serializeUser(user: UserRecord) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
  }
}

async function startUserSession(userId: string) {
  const cookieStore = await cookies()
  const session = await withTransaction(async (client) => {
    const expiresAt = new Date(Date.now() + APP_SESSION_MAX_AGE_SECONDS * 1000)
    return authSessionsRepository.create(client, userId, expiresAt)
  })

  cookieStore.set(APP_SESSION_COOKIE, session.id, APP_SESSION_COOKIE_OPTIONS)

  const notionConnection = await withTransaction((client) =>
    notionConnectionsRepository.findLatestForUser(client, userId)
  )

  if (notionConnection?.encryptedAccessToken) {
    cookieStore.set(
      NOTION_TOKEN_COOKIE,
      decryptString(notionConnection.encryptedAccessToken),
      NOTION_TOKEN_COOKIE_OPTIONS
    )
  } else {
    cookieStore.delete(NOTION_TOKEN_COOKIE)
  }
}

export async function POST(request: Request) {
  try {
    if (!verifySameOrigin(request)) {
      return jsonNoStore({ error: "Forbidden origin" }, { status: 403 })
    }

    const body = (await request.json()) as SignInPayload
    const email = normalizeEmail(body.email ?? "")
    const password = body.password ?? ""

    if (!email || !password) {
      return jsonNoStore({ error: "メールアドレスとパスワードを入力してください。" }, { status: 400 })
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return jsonNoStore({ error: "メールアドレスの形式が正しくありません。" }, { status: 400 })
    }

    const user = await withTransaction((client) => usersRepository.findByEmail(client, email))

    if (!user?.passwordHash) {
      return jsonNoStore({ error: "メールアドレスまたはパスワードが違います。" }, { status: 401 })
    }

    const valid = await verifyPassword(password, user.passwordHash)

    if (!valid) {
      return jsonNoStore({ error: "メールアドレスまたはパスワードが違います。" }, { status: 401 })
    }

    await startUserSession(user.id)
    return jsonNoStore({ user: serializeUser(user) })
  } catch (error) {
    const message = error instanceof Error ? error.message : "ログインに失敗しました。"
    return jsonNoStore({ error: message }, { status: 500 })
  }
}
