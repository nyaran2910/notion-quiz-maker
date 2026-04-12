import type { PoolClient } from "@/lib/db/client"
import { execute } from "@/lib/db/client"

type QuizSetRow = {
  id: string
}

type QuizSessionRow = {
  id: string
}

export const quizSetsRepository = {
  async create(client: PoolClient, userId: string, name: string, description: string | null = null) {
    const result = await execute<QuizSetRow>(
      client,
      `insert into quiz_sets (user_id, name, description)
       values ($1, $2, $3)
       returning id`,
      [userId, name, description]
    )

    return result.rows[0].id
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
