import type { PoolClient } from "@/lib/db/client"
import { execute } from "@/lib/db/client"

type NotionConnectionRow = {
  id: string
  user_id: string
  workspace_id: string
  workspace_name?: string | null
  encrypted_access_token?: Buffer
}

export type NotionConnectionRecord = {
  id: string
  userId: string
  workspaceId: string
  workspaceName: string | null
  encryptedAccessToken?: Buffer
}

function toNotionConnectionRecord(row: NotionConnectionRow): NotionConnectionRecord {
  return {
    id: row.id,
    userId: row.user_id,
    workspaceId: row.workspace_id,
    workspaceName: row.workspace_name ?? null,
    encryptedAccessToken: row.encrypted_access_token,
  }
}

export const notionConnectionsRepository = {
  async upsert(client: PoolClient, input: {
    userId: string
    workspaceId: string
    workspaceName: string | null
    workspaceIconUrl: string | null
    encryptedAccessToken: Buffer
  }) {
    const result = await execute<NotionConnectionRow>(
      client,
      `insert into notion_connections (
         user_id,
         workspace_id,
         workspace_name,
         workspace_icon_url,
         encrypted_access_token
       ) values ($1, $2, $3, $4, $5)
       on conflict (user_id, workspace_id) do update
         set workspace_name = excluded.workspace_name,
             workspace_icon_url = excluded.workspace_icon_url,
             encrypted_access_token = excluded.encrypted_access_token,
             updated_at = now()
       returning id, user_id, workspace_id, workspace_name`,
      [
        input.userId,
        input.workspaceId,
        input.workspaceName,
        input.workspaceIconUrl,
        input.encryptedAccessToken,
      ]
    )

    return toNotionConnectionRecord(result.rows[0])
  },

  async findLatestForUser(client: PoolClient, userId: string) {
    const result = await execute<NotionConnectionRow>(
      client,
      `select id, user_id, workspace_id, workspace_name, encrypted_access_token
         from notion_connections
        where user_id = $1
        order by updated_at desc, created_at desc
        limit 1`,
      [userId]
    )

    return result.rows[0] ? toNotionConnectionRecord(result.rows[0]) : null
  },

  async deleteByUserId(client: PoolClient, userId: string) {
    await execute(client, "delete from notion_connections where user_id = $1", [userId])
  },
}
