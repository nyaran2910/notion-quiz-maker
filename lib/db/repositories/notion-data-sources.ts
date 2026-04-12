import type { PoolClient } from "@/lib/db/client"
import { execute } from "@/lib/db/client"

type NotionDataSourceRow = {
  id: string
  notion_connection_id: string
  data_source_id: string
  name: string
  url: string | null
}

export type NotionDataSourceRecord = {
  id: string
  notionConnectionId: string
  dataSourceId: string
  name: string
  url: string | null
}

function toNotionDataSourceRecord(row: NotionDataSourceRow): NotionDataSourceRecord {
  return {
    id: row.id,
    notionConnectionId: row.notion_connection_id,
    dataSourceId: row.data_source_id,
    name: row.name,
    url: row.url,
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
       returning id, notion_connection_id, data_source_id, name, url`,
      [input.notionConnectionId, input.dataSourceId, input.name, input.url]
    )

    return toNotionDataSourceRecord(result.rows[0])
  },
}
