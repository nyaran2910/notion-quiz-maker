import { cookies } from "next/headers"

import { APP_SESSION_COOKIE, APP_SESSION_COOKIE_OPTIONS, APP_SESSION_MAX_AGE_SECONDS } from "@/lib/auth/session"
import { hashPassword } from "@/lib/auth/password"
import { withTransaction } from "@/lib/db/client"
import { authSessionsRepository } from "@/lib/db/repositories/auth-sessions"
import { usersRepository, type UserRecord } from "@/lib/db/repositories/users"
import { jsonNoStore, verifySameOrigin } from "@/lib/http"
import { NOTION_TOKEN_COOKIE } from "@/lib/notion/session"

export const dynamic = "force-dynamic"

type SignUpPayload = {
  email?: string
  password?: string
  passwordConfirmation?: string
  displayName?: string | null
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase()
}

function isStrongPassword(password: string) {
  return password.length >= 10 && /[A-Za-z]/.test(password) && /\d/.test(password)
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
  cookieStore.delete(NOTION_TOKEN_COOKIE)
}

export async function POST(request: Request) {
  try {
    if (!verifySameOrigin(request)) {
      return jsonNoStore({ error: "Forbidden origin" }, { status: 403 })
    }

    const body = (await request.json()) as SignUpPayload
    const email = normalizeEmail(body.email ?? "")
    const password = body.password ?? ""
    const passwordConfirmation = body.passwordConfirmation ?? ""
    const displayName = body.displayName?.trim() || null

    if (!email || !password) {
      return jsonNoStore({ error: "メールアドレスとパスワードを入力してください。" }, { status: 400 })
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return jsonNoStore({ error: "メールアドレスの形式が正しくありません。" }, { status: 400 })
    }

    if (password !== passwordConfirmation) {
      return jsonNoStore({ error: "確認用パスワードが一致しません。" }, { status: 400 })
    }

    if (!isStrongPassword(password)) {
      return jsonNoStore({ error: "パスワードは10文字以上で、英字と数字を含めてください。" }, { status: 400 })
    }

    const passwordHash = await hashPassword(password)
    const user = await withTransaction(async (client) => {
      const existing = await usersRepository.findByEmail(client, email)

      if (existing) {
        throw new Error("このメールアドレスは既に使われています。")
      }

      return usersRepository.createAccount(client, {
        email,
        displayName,
        passwordHash,
      })
    })

    await startUserSession(user.id)
    return jsonNoStore({ user: serializeUser(user) })
  } catch (error) {
    const message = error instanceof Error ? error.message : "アカウント作成に失敗しました。"
    const status = message.includes("既に使われています") ? 409 : 500
    return jsonNoStore({ error: message }, { status })
  }
}
