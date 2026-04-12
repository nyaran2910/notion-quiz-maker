import type { PoolClient } from "@/lib/db/client"
import { execute } from "@/lib/db/client"
import type { QuizSourceConfig } from "@/lib/notion/quiz-types"

type QuizSetRow = {
  id: string
  user_id?: string
  name?: string
  description?: string | null
  is_default?: boolean
  is_temporary?: boolean
  updated_at?: Date
}

type QuizSessionRow = {
  id: string
}

type QuizSetSourceRow = {
  quiz_set_id: string
  quiz_set_name: string
  quiz_set_description: string | null
  quiz_set_is_default: boolean
  quiz_set_updated_at: Date
  data_source_id: string | null
  data_source_name: string | null
  data_source_url: string | null
  mappings: QuizSourceConfig["mappings"] | null
}

export type QuizSetRecord = {
  id: string
  name: string
  description: string | null
  isDefault: boolean
  updatedAt: Date
  sources: QuizSourceConfig[]
}

function aggregateQuizSets(rows: QuizSetSourceRow[]) {
  const quizSets = new Map<string, QuizSetRecord>()

  for (const row of rows) {
    const existing = quizSets.get(row.quiz_set_id) ?? {
      id: row.quiz_set_id,
      name: row.quiz_set_name,
      description: row.quiz_set_description,
      isDefault: row.quiz_set_is_default,
      updatedAt: row.quiz_set_updated_at,
      sources: [],
    }

    if (row.data_source_id && row.data_source_name) {
      existing.sources.push({
        dataSourceId: row.data_source_id,
        dataSourceName: row.data_source_name,
        dataSourceUrl: row.data_source_url ?? undefined,
        mappings: row.mappings ?? {},
      })
    }

    quizSets.set(row.quiz_set_id, existing)
  }

  return [...quizSets.values()]
}

export const quizSetsRepository = {
  async create(client: PoolClient, userId: string, name: string, description: string | null = null, options?: { isTemporary?: boolean }) {
    const result = await execute<QuizSetRow>(
      client,
      `insert into quiz_sets (user_id, name, description, is_temporary)
       values ($1, $2, $3, $4)
       returning id`,
      [userId, name, description, options?.isTemporary ?? false]
    )

    return result.rows[0].id
  },

  async listForUser(client: PoolClient, userId: string) {
    const result = await execute<QuizSetSourceRow>(
      client,
      `select
         qs.id as quiz_set_id,
         qs.name as quiz_set_name,
         qs.description as quiz_set_description,
         qs.is_default as quiz_set_is_default,
         qs.updated_at as quiz_set_updated_at,
         nds.data_source_id,
         nds.name as data_source_name,
         nds.url as data_source_url,
         qss.mappings
       from quiz_sets qs
       left join quiz_set_sources qss
         on qss.quiz_set_id = qs.id
       left join notion_data_sources nds
          on nds.id = qss.notion_data_source_id
       where qs.user_id = $1
         and qs.is_temporary = false
       order by qs.updated_at desc, nds.name asc`,
      [userId]
    )

    return aggregateQuizSets(result.rows)
  },

  async replaceSources(client: PoolClient, quizSetId: string, sources: Array<{ notionDataSourceId: string, mappings: QuizSourceConfig["mappings"] }>) {
    await execute(client, "delete from quiz_set_sources where quiz_set_id = $1", [quizSetId])

    for (const source of sources) {
      await execute(
        client,
        `insert into quiz_set_sources (quiz_set_id, notion_data_source_id, mappings)
         values ($1, $2, $3::jsonb)`,
        [quizSetId, source.notionDataSourceId, JSON.stringify(source.mappings)]
      )
    }
  },

  async update(client: PoolClient, userId: string, quizSetId: string, input: { name: string, description: string | null }) {
    await execute(
      client,
      `update quiz_sets
          set name = $3,
              description = $4,
              updated_at = now()
        where id = $1
          and user_id = $2`,
      [quizSetId, userId, input.name, input.description]
    )
  },

  async delete(client: PoolClient, userId: string, quizSetId: string) {
    await execute(client, "delete from quiz_sets where id = $1 and user_id = $2", [quizSetId, userId])
  },

  async addSource(client: PoolClient, quizSetId: string, notionDataSourceId: string) {
    await execute(
      client,
      `insert into quiz_set_sources (quiz_set_id, notion_data_source_id)
       values ($1, $2)
       on conflict (quiz_set_id, notion_data_source_id) do nothing`,
      [quizSetId, notionDataSourceId]
    )
  },

  async createSession(client: PoolClient, input: { userId: string, quizSetId: string, mode: string | null }) {
    const result = await execute<QuizSessionRow>(
      client,
      `insert into quiz_sessions (user_id, quiz_set_id, mode)
       values ($1, $2, $3)
       returning id`,
      [input.userId, input.quizSetId, input.mode]
    )

    return result.rows[0].id
  },
}
