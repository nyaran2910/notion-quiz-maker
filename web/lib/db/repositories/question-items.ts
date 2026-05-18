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

export type QuestionItemUpsertInput = {
  userId: string
  notionDataSourceId: string
  pageId: string
  category: string | null
  contentCache: Record<string, unknown> | null
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
  async upsert(client: PoolClient, input: QuestionItemUpsertInput) {
    const result = await execute<QuestionItemRow>(
      client,
      `insert into question_items (user_id, notion_data_source_id, page_id, category, content_cache)
       values ($1, $2, $3, $4, $5)
       on conflict (user_id, page_id) do update
         set notion_data_source_id = excluded.notion_data_source_id,
             category = excluded.category,
             content_cache = excluded.content_cache,
             archived_at = null,
             updated_at = now()
        returning id, user_id, notion_data_source_id, page_id, category, content_cache`,
      [input.userId, input.notionDataSourceId, input.pageId, input.category, input.contentCache]
    )

    return toQuestionItemRecord(result.rows[0])
  },

  async upsertMany(client: PoolClient, inputs: QuestionItemUpsertInput[]) {
    if (inputs.length === 0) {
      return []
    }

    const result = await execute<QuestionItemRow>(
      client,
      `insert into question_items (user_id, notion_data_source_id, page_id, category, content_cache)
       select user_id, notion_data_source_id, page_id, category, content_cache
         from jsonb_to_recordset($1::jsonb) as input(
           user_id uuid,
           notion_data_source_id uuid,
           page_id text,
           category text,
           content_cache jsonb
         )
       on conflict (user_id, page_id) do update
         set notion_data_source_id = excluded.notion_data_source_id,
             category = excluded.category,
             content_cache = excluded.content_cache,
             archived_at = null,
             updated_at = now()
       returning id, user_id, notion_data_source_id, page_id, category, content_cache`,
      [JSON.stringify(inputs.map((input) => ({
        user_id: input.userId,
        notion_data_source_id: input.notionDataSourceId,
        page_id: input.pageId,
        category: input.category,
        content_cache: input.contentCache,
      })))]
    )

    return result.rows.map(toQuestionItemRecord)
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

   async deleteMissingForDataSource(client: PoolClient, input: {
     userId: string
     notionDataSourceId: string
     pageIds: string[]
   }) {
     const result = await execute<{ id: string }>(
       client,
       `delete from question_items
         where user_id = $1
           and notion_data_source_id = $2
           and not (page_id = any($3::text[]))
       returning id`,
       [input.userId, input.notionDataSourceId, input.pageIds]
     )

     return result.rowCount ?? 0
   },
}
