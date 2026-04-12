import type { PoolClient } from "@/lib/db/client"
import { execute } from "@/lib/db/client"

type UserRow = {
  id: string
  external_auth_id: string | null
  email: string | null
  display_name: string | null
}

export type UserRecord = {
  id: string
  externalAuthId: string | null
  email: string | null
  displayName: string | null
}

function toUserRecord(row: UserRow): UserRecord {
  return {
    id: row.id,
    externalAuthId: row.external_auth_id,
    email: row.email,
    displayName: row.display_name,
  }
}

export const usersRepository = {
  async upsertWorkspaceUser(client: PoolClient, workspaceId: string, displayName: string | null) {
    const result = await execute<UserRow>(
      client,
      `insert into users (external_auth_id, display_name)
       values ($1, $2)
       on conflict (external_auth_id) do update
         set display_name = excluded.display_name,
             updated_at = now()
       returning id, external_auth_id, email, display_name`,
      [workspaceId, displayName]
    )

    return toUserRecord(result.rows[0])
  },
}
