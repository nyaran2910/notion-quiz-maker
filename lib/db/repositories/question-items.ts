import type { PoolClient } from "@/lib/db/client"
import { execute } from "@/lib/db/client"

type QuestionItemRow = {
  id: string
  user_id: string
  notion_data_source_id: string
  page_id: string
  category: string | null
  content_cache: Record<string, unknown> | null
}

export type QuestionItemRecord = {
  id: string
  userId: string
  notionDataSourceId: string
  pageId: string
  category: string | null
  contentCache: Record<string, unknown> | null
}

function toQuestionItemRecord(row: QuestionItemRow): QuestionItemRecord {
  return {
    id: row.id,
    userId: row.user_id,
    notionDataSourceId: row.notion_data_source_id,
    pageId: row.page_id,
    category: row.category,
    contentCache: row.content_cache,
  }
}

export const questionItemsRepository = {
  async upsert(client: PoolClient, input: {
    userId: string
    notionDataSourceId: string
    pageId: string
    category: string | null
    contentCache: Record<string, unknown> | null
  }) {
    const result = await execute<QuestionItemRow>(
      client,
      `insert into question_items (user_id, notion_data_source_id, page_id, category, content_cache)
       values ($1, $2, $3, $4, $5)
       on conflict (notion_data_source_id, page_id) do update
         set category = excluded.category,
             content_cache = excluded.content_cache,
             updated_at = now()
       returning id, user_id, notion_data_source_id, page_id, category, content_cache`,
      [input.userId, input.notionDataSourceId, input.pageId, input.category, input.contentCache]
    )

    return toQuestionItemRecord(result.rows[0])
  },

  async findById(client: PoolClient, questionItemId: string) {
    const result = await execute<QuestionItemRow>(
      client,
      `select id, user_id, notion_data_source_id, page_id, category, content_cache
         from question_items
        where id = $1`,
      [questionItemId]
    )

    return result.rows[0] ? toQuestionItemRecord(result.rows[0]) : null
  },

  async deleteForUserDataSource(client: PoolClient, userId: string, dataSourceId: string) {
    const result = await execute<{ id: string }>(
      client,
      `delete from question_items qi
        using notion_data_sources nds
       where qi.notion_data_source_id = nds.id
         and qi.user_id = $1
         and nds.data_source_id = $2
      returning qi.id`,
      [userId, dataSourceId]
    )

    return result.rowCount ?? 0
  },
}
