import "server-only"

import { cookies } from "next/headers"

import { withTransaction } from "@/lib/db/client"
import { authSessionsRepository } from "@/lib/db/repositories/auth-sessions"
import { usersRepository, type UserRecord } from "@/lib/db/repositories/users"
import { APP_SESSION_COOKIE } from "@/lib/auth/session"
import { getServerEnv } from "@/lib/server-env"

function isDatabaseEnabled() {
  return Boolean(getServerEnv().databaseUrl)
}

export async function getCurrentUser(): Promise<UserRecord | null> {
  if (!isDatabaseEnabled()) {
    return null
  }

  const cookieStore = await cookies()
  const sessionId = cookieStore.get(APP_SESSION_COOKIE)?.value

  if (!sessionId) {
    return null
  }

  return withTransaction(async (client) => {
    const session = await authSessionsRepository.findValidById(client, sessionId)

    if (!session) {
      return null
    }

    return usersRepository.findById(client, session.userId)
  })
}

export async function requireCurrentUser() {
  const user = await getCurrentUser()

  if (!user) {
    throw new Error("App session is not connected")
  }

  return user
}
