import type { PoolClient } from "@/lib/db/client"
import { execute } from "@/lib/db/client"

type NotionDataSourceRow = {
  id: string
  notion_connection_id: string
  data_source_id: string
  name: string
  url: string | null
  last_synced_at: Date | null
}

export type NotionDataSourceRecord = {
  id: string
  notionConnectionId: string
  dataSourceId: string
  name: string
  url: string | null
  lastSyncedAt: Date | null
}

function toNotionDataSourceRecord(row: NotionDataSourceRow): NotionDataSourceRecord {
  return {
    id: row.id,
    notionConnectionId: row.notion_connection_id,
    dataSourceId: row.data_source_id,
    name: row.name,
    url: row.url,
    lastSyncedAt: row.last_synced_at,
  }
}

export const notionDataSourcesRepository = {
  async upsert(client: PoolClient, input: {
    notionConnectionId: string
    dataSourceId: string
    name: string
    url: string | null
  }) {
    const result = await execute<NotionDataSourceRow>(
      client,
      `insert into notion_data_sources (notion_connection_id, data_source_id, name, url)
       values ($1, $2, $3, $4)
       on conflict (notion_connection_id, data_source_id) do update
         set name = excluded.name,
             url = excluded.url,
             updated_at = now()
       returning id, notion_connection_id, data_source_id, name, url, last_synced_at`,
      [input.notionConnectionId, input.dataSourceId, input.name, input.url]
    )

    return toNotionDataSourceRecord(result.rows[0])
  },

  async listForUserDataSourceIds(client: PoolClient, userId: string, dataSourceIds: string[]) {
    if (dataSourceIds.length === 0) {
      return []
    }

    const result = await execute<NotionDataSourceRow>(
      client,
      `select nds.id, nds.notion_connection_id, nds.data_source_id, nds.name, nds.url, nds.last_synced_at
         from notion_data_sources nds
         join notion_connections nc
           on nc.id = nds.notion_connection_id
        where nc.user_id = $1
          and nds.data_source_id = any($2::text[])`,
      [userId, dataSourceIds]
    )

    return result.rows.map(toNotionDataSourceRecord)
  },

  async markSynced(client: PoolClient, notionDataSourceIds: string[], syncedAt: Date) {
    if (notionDataSourceIds.length === 0) {
      return
    }

    await execute(
      client,
      `update notion_data_sources
          set last_synced_at = $2,
              updated_at = now()
        where id = any($1::uuid[])`,
      [notionDataSourceIds, syncedAt]
    )
  },
}
