import type { PoolClient } from "@/lib/db/client"
import { execute } from "@/lib/db/client"

type UserRow = {
  id: string
  external_auth_id: string | null
  email: string | null
  display_name: string | null
  password_hash: string | null
}

export type UserRecord = {
  id: string
  externalAuthId: string | null
  email: string | null
  displayName: string | null
  passwordHash: string | null
}

function toUserRecord(row: UserRow): UserRecord {
  return {
    id: row.id,
    externalAuthId: row.external_auth_id,
    email: row.email,
    displayName: row.display_name,
    passwordHash: row.password_hash,
  }
}

export const usersRepository = {
  async createAccount(client: PoolClient, input: { email: string, displayName: string | null, passwordHash: string }) {
    const result = await execute<UserRow>(
      client,
      `insert into users (email, display_name, password_hash)
       values ($1, $2, $3)
       returning id, external_auth_id, email, display_name, password_hash`,
      [input.email, input.displayName, input.passwordHash]
    )

    return toUserRecord(result.rows[0])
  },

  async findByEmail(client: PoolClient, email: string) {
    const result = await execute<UserRow>(
      client,
      `select id, external_auth_id, email, display_name, password_hash
         from users
        where email = $1`,
      [email]
    )

    return result.rows[0] ? toUserRecord(result.rows[0]) : null
  },

  async findById(client: PoolClient, userId: string) {
    const result = await execute<UserRow>(
      client,
      `select id, external_auth_id, email, display_name, password_hash
         from users
        where id = $1`,
      [userId]
    )

    return result.rows[0] ? toUserRecord(result.rows[0]) : null
  },

  async updateProfile(client: PoolClient, userId: string, input: { email: string, displayName: string | null }) {
    const result = await execute<UserRow>(
      client,
      `update users
          set email = $2,
              display_name = $3
        where id = $1
      returning id, external_auth_id, email, display_name, password_hash`,
      [userId, input.email, input.displayName]
    )

    return result.rows[0] ? toUserRecord(result.rows[0]) : null
  },

  async updatePasswordHash(client: PoolClient, userId: string, passwordHash: string) {
    const result = await execute<UserRow>(
      client,
      `update users
          set password_hash = $2
        where id = $1
      returning id, external_auth_id, email, display_name, password_hash`,
      [userId, passwordHash]
    )

    return result.rows[0] ? toUserRecord(result.rows[0]) : null
  },

  async deleteById(client: PoolClient, userId: string) {
    await execute(client, "delete from users where id = $1", [userId])
  },
}
