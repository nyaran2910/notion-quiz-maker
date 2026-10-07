import { encryptString } from "@/lib/crypto"
import { requireCurrentUser } from "@/lib/auth/user"
import { withTransaction } from "@/lib/db/client"
import { notionConnectionsRepository } from "@/lib/db/repositories/notion-connections"
import { notionDataSourcesRepository } from "@/lib/db/repositories/notion-data-sources"
import { quizSetsRepository } from "@/lib/db/repositories/quiz-sets"
import { getSessionProfile } from "@/lib/notion/api"
import { getNotionClient, getNotionTokenFromSession } from "@/lib/notion/client"
import type { QuizSourceConfig } from "@/lib/notion/quiz-types"

function assertNotionSession<T>(value: T | null): T {
  if (!value) {
    throw new Error("Notion session is not connected")
  }

  return value
}

async function ensurePersistedSources(userId: string, sources: QuizSourceConfig[]) {
  assertNotionSession(await getNotionClient())
  const token = await getNotionTokenFromSession()
  const profile = await getSessionProfile()

  if (!token || !profile) {
    throw new Error("Notion session is not connected")
  }

  return withTransaction(async (client) => {
    const connection = await notionConnectionsRepository.upsert(client, {
      userId,
      workspaceId: profile.workspaceId,
      workspaceName: profile.workspaceName,
      workspaceIconUrl: null,
      encryptedAccessToken: encryptString(token),
    })

    const persistedSources = [] as Array<{ notionDataSourceId: string, mappings: QuizSourceConfig["mappings"] }>

    for (const source of sources) {
      const dataSource = await notionDataSourcesRepository.upsert(client, {
        notionConnectionId: connection.id,
        dataSourceId: source.dataSourceId,
        name: source.dataSourceName,
        url: source.dataSourceUrl ?? null,
      })

      persistedSources.push({
        notionDataSourceId: dataSource.id,
        mappings: source.mappings,
      })
    }

    return persistedSources
  })
}

export async function listQuizSets() {
  const user = await requireCurrentUser()
  return withTransaction(async (client) => quizSetsRepository.listForUser(client, user.id))
}

export async function createQuizSet(input: { name: string, description: string | null, sources: QuizSourceConfig[] }) {
  const user = await requireCurrentUser()
  const persistedSources = await ensurePersistedSources(user.id, input.sources)

  return withTransaction(async (client) => {
    const quizSetId = await quizSetsRepository.create(client, user.id, input.name, input.description)
    await quizSetsRepository.replaceSources(client, quizSetId, persistedSources)

    const quizSets = await quizSetsRepository.listForUser(client, user.id)
    return quizSets.find((quizSet) => quizSet.id === quizSetId) ?? null
  })
}

export async function updateQuizSet(quizSetId: string, input: { name: string, description: string | null, sources: QuizSourceConfig[] }) {
  const user = await requireCurrentUser()
  const persistedSources = await ensurePersistedSources(user.id, input.sources)

  return withTransaction(async (client) => {
    await quizSetsRepository.update(client, user.id, quizSetId, {
      name: input.name,
      description: input.description,
    })
    await quizSetsRepository.replaceSources(client, quizSetId, persistedSources)

    const quizSets = await quizSetsRepository.listForUser(client, user.id)
    return quizSets.find((quizSet) => quizSet.id === quizSetId) ?? null
  })
}

export async function deleteQuizSet(quizSetId: string) {
  const user = await requireCurrentUser()

  return withTransaction(async (client) => {
    await quizSetsRepository.delete(client, user.id, quizSetId)
  })
}
