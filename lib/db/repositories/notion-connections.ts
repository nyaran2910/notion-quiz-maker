import type { PoolClient } from "@/lib/db/client"
import { execute } from "@/lib/db/client"

type NotionConnectionRow = {
  id: string
  user_id: string
  workspace_id: string
}

export type NotionConnectionRecord = {
  id: string
  userId: string
  workspaceId: string
}

function toNotionConnectionRecord(row: NotionConnectionRow): NotionConnectionRecord {
  return {
    id: row.id,
    userId: row.user_id,
    workspaceId: row.workspace_id,
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
       returning id, user_id, workspace_id`,
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
}
