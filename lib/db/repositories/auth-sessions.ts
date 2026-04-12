import type { PoolClient } from "@/lib/db/client"
import { execute } from "@/lib/db/client"

type AuthSessionRow = {
  id: string
  user_id: string
  expires_at: Date
}

export type AuthSessionRecord = {
  id: string
  userId: string
  expiresAt: Date
}

function toAuthSessionRecord(row: AuthSessionRow): AuthSessionRecord {
  return {
    id: row.id,
    userId: row.user_id,
    expiresAt: row.expires_at,
  }
}

export const authSessionsRepository = {
  async create(client: PoolClient, userId: string, expiresAt: Date) {
    const result = await execute<AuthSessionRow>(
      client,
      `insert into auth_sessions (user_id, expires_at)
       values ($1, $2)
       returning id, user_id, expires_at`,
      [userId, expiresAt]
    )

    return toAuthSessionRecord(result.rows[0])
  },

  async findValidById(client: PoolClient, sessionId: string) {
    const result = await execute<AuthSessionRow>(
      client,
      `select id, user_id, expires_at
         from auth_sessions
        where id = $1
          and expires_at > now()`,
      [sessionId]
    )

    return result.rows[0] ? toAuthSessionRecord(result.rows[0]) : null
  },

  async deleteById(client: PoolClient, sessionId: string) {
    await execute(client, "delete from auth_sessions where id = $1", [sessionId])
  },

  async deleteByUserId(client: PoolClient, userId: string) {
    await execute(client, "delete from auth_sessions where user_id = $1", [userId])
  },
}
