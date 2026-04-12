"use server"

import { cookies } from "next/headers"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { APP_SESSION_COOKIE, APP_SESSION_COOKIE_OPTIONS, APP_SESSION_MAX_AGE_SECONDS } from "@/lib/auth/session"
import { hashPassword, verifyPassword } from "@/lib/auth/password"
import { withTransaction } from "@/lib/db/client"
import { authSessionsRepository } from "@/lib/db/repositories/auth-sessions"
import { usersRepository } from "@/lib/db/repositories/users"
import { NOTION_TOKEN_COOKIE } from "@/lib/notion/session"

export type AuthActionState = {
  error: string | null
}

export type AccountActionState = {
  error: string | null
  success: string | null
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase()
}

function isStrongPassword(password: string) {
  return password.length >= 10 && /[A-Za-z]/.test(password) && /\d/.test(password)
}

async function startUserSession(userId: string) {
  const cookieStore = await cookies()

  const session = await withTransaction(async (client) => {
    const expiresAt = new Date(Date.now() + APP_SESSION_MAX_AGE_SECONDS * 1000)
    return authSessionsRepository.create(client, userId, expiresAt)
  })

  cookieStore.set(APP_SESSION_COOKIE, session.id, APP_SESSION_COOKIE_OPTIONS)
}

function revalidateAll() {
  revalidatePath("/")
  revalidatePath("/login")
  revalidatePath("/setup")
  revalidatePath("/quiz")
}

async function requireAuthenticatedUser() {
  const cookieStore = await cookies()
  const sessionId = cookieStore.get(APP_SESSION_COOKIE)?.value

  if (!sessionId) {
    throw new Error("ログインし直してください。")
  }

  const session = await withTransaction(async (client) => authSessionsRepository.findValidById(client, sessionId))

  if (!session) {
    throw new Error("ログインし直してください。")
  }

  const user = await withTransaction(async (client) => usersRepository.findById(client, session.userId))

  if (!user) {
    throw new Error("ユーザー情報を確認できませんでした。")
  }

  return user
}

export async function signUp(
  _prevState: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const email = normalizeEmail(String(formData.get("email") ?? ""))
  const password = String(formData.get("password") ?? "")
  const passwordConfirmation = String(formData.get("passwordConfirmation") ?? "")
  const displayName = String(formData.get("displayName") ?? "").trim() || null

  if (!email || !password) {
    return { error: "メールアドレスとパスワードを入力してください。" }
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: "メールアドレスの形式が正しくありません。" }
  }

  if (password !== passwordConfirmation) {
    return { error: "確認用パスワードが一致しません。" }
  }

  if (!isStrongPassword(password)) {
    return { error: "パスワードは10文字以上で、英字と数字を含めてください。" }
  }

  let createdUserId: string | null = null

  try {
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

    createdUserId = user.id
  } catch (error) {
    return { error: error instanceof Error ? error.message : "アカウント作成に失敗しました。" }
  }

  if (!createdUserId) {
    return { error: "アカウント作成に失敗しました。" }
  }

  await startUserSession(createdUserId)
  revalidateAll()
  redirect("/")
}

export async function signIn(
  _prevState: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const email = normalizeEmail(String(formData.get("email") ?? ""))
  const password = String(formData.get("password") ?? "")

  if (!email || !password) {
    return { error: "メールアドレスとパスワードを入力してください。" }
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: "メールアドレスの形式が正しくありません。" }
  }

  let signedInUserId: string | null = null

  try {
    const user = await withTransaction(async (client) => usersRepository.findByEmail(client, email))

    if (!user?.passwordHash) {
      return { error: "メールアドレスまたはパスワードが違います。" }
    }

    const valid = await verifyPassword(password, user.passwordHash)

    if (!valid) {
      return { error: "メールアドレスまたはパスワードが違います。" }
    }

    signedInUserId = user.id
  } catch {
    return { error: "ログインに失敗しました。" }
  }

  if (!signedInUserId) {
    return { error: "ログインに失敗しました。" }
  }

  await startUserSession(signedInUserId)
  revalidateAll()
  redirect("/")
}

export async function signOut() {
  const cookieStore = await cookies()
  const sessionId = cookieStore.get(APP_SESSION_COOKIE)?.value

  if (sessionId) {
    await withTransaction(async (client) => {
      await authSessionsRepository.deleteById(client, sessionId)
    })
  }

  cookieStore.delete(APP_SESSION_COOKIE)
  cookieStore.delete(NOTION_TOKEN_COOKIE)
  revalidateAll()
  redirect("/login")
}

export async function updateAccountProfile(
  _prevState: AccountActionState,
  formData: FormData
): Promise<AccountActionState> {
  const email = normalizeEmail(String(formData.get("email") ?? ""))
  const displayName = String(formData.get("displayName") ?? "").trim() || null

  if (!email) {
    return { error: "メールアドレスを入力してください。", success: null }
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: "メールアドレスの形式が正しくありません。", success: null }
  }

  try {
    const user = await requireAuthenticatedUser()

    await withTransaction(async (client) => {
      const existing = await usersRepository.findByEmail(client, email)

      if (existing && existing.id !== user.id) {
        throw new Error("このメールアドレスは既に使われています。")
      }

      await usersRepository.updateProfile(client, user.id, {
        email,
        displayName,
      })
    })

    revalidateAll()
    return { error: null, success: "プロフィールを更新しました。" }
  } catch (error) {
    return { error: error instanceof Error ? error.message : "プロフィール更新に失敗しました。", success: null }
  }
}

export async function updateAccountPassword(
  _prevState: AccountActionState,
  formData: FormData
): Promise<AccountActionState> {
  const currentPassword = String(formData.get("currentPassword") ?? "")
  const newPassword = String(formData.get("newPassword") ?? "")
  const passwordConfirmation = String(formData.get("passwordConfirmation") ?? "")

  if (!currentPassword || !newPassword || !passwordConfirmation) {
    return { error: "現在と新しいパスワードを入力してください。", success: null }
  }

  if (newPassword !== passwordConfirmation) {
    return { error: "確認用パスワードが一致しません。", success: null }
  }

  if (!isStrongPassword(newPassword)) {
    return { error: "パスワードは10文字以上で、英字と数字を含めてください。", success: null }
  }

  try {
    const user = await requireAuthenticatedUser()

    if (!user.passwordHash) {
      return { error: "このアカウントではパスワード変更ができません。", success: null }
    }

    const valid = await verifyPassword(currentPassword, user.passwordHash)

    if (!valid) {
      return { error: "現在のパスワードが違います。", success: null }
    }

    const passwordHash = await hashPassword(newPassword)

    await withTransaction(async (client) => {
      await usersRepository.updatePasswordHash(client, user.id, passwordHash)
    })

    revalidateAll()
    return { error: null, success: "パスワードを更新しました。" }
  } catch (error) {
    return { error: error instanceof Error ? error.message : "パスワード変更に失敗しました。", success: null }
  }
}

export async function deleteAccount(
  _prevState: AccountActionState,
  formData: FormData
): Promise<AccountActionState> {
  const confirmation = String(formData.get("confirmation") ?? "")

  if (confirmation !== "DELETE") {
    return { error: "確認欄に DELETE と入力してください。", success: null }
  }

  let deleted = false

  try {
    const user = await requireAuthenticatedUser()
    const cookieStore = await cookies()

    await withTransaction(async (client) => {
      await authSessionsRepository.deleteByUserId(client, user.id)
      await usersRepository.deleteById(client, user.id)
    })
    
    cookieStore.delete(APP_SESSION_COOKIE)
    cookieStore.delete(NOTION_TOKEN_COOKIE)
    revalidateAll()
    deleted = true
  } catch (error) {
    return { error: error instanceof Error ? error.message : "アカウント削除に失敗しました。", success: null }
  }

  if (!deleted) {
    return { error: "アカウント削除に失敗しました。", success: null }
  }

  redirect("/login")
}
