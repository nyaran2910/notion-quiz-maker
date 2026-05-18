import { isFullDataSource } from "@notionhq/client"

import { getNotionClient } from "./client"
import { getQuizRequirement, type QuizRequirementKey } from "./quiz-schema"

type RichTextToken = {
  plain_text?: string
}

type ParentReference = {
  type?: string
  page_id?: string
  block_id?: string
  database_id?: string
}

type DatabaseMetadata = {
  title: string
  parent: ParentReference | null
}

type DataSourceProperty = {
  id: string
  name: string
  type: string
}

const NOTION_METADATA_TIMEOUT_MS = 5000

export type AccessibleDataSource = {
  id: string
  name: string
  databaseId: string | null
  parentTitle: string | null
  url: string
}

export type DataSourceSchema = {
  id: string
  title: string
  properties: DataSourceProperty[]
}

function getPropertyCreationPayload(key: QuizRequirementKey) {
  const requirement = getQuizRequirement(key)

  switch (key) {
    case "question":
      return {
        [requirement.suggestedName]: {
          name: requirement.suggestedName,
          type: "rich_text" as const,
          rich_text: {},
        },
      }
    case "answer":
      return {
        [requirement.suggestedName]: {
          name: requirement.suggestedName,
          type: "rich_text" as const,
          rich_text: {},
        },
      }
    case "explanation":
      return {
        [requirement.suggestedName]: {
          name: requirement.suggestedName,
          type: "rich_text" as const,
          rich_text: {},
        },
      }
    case "image":
      return {
        [requirement.suggestedName]: {
          name: requirement.suggestedName,
          type: "files" as const,
          files: {},
        },
      }
  }
}

type NotionTitleContainer = {
  title?: RichTextToken[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object"
}

function extractPageTitle(page: unknown) {
  if (!isRecord(page) || !isRecord(page.properties)) {
    return null
  }

  for (const property of Object.values(page.properties)) {
    if (!isRecord(property) || property.type !== "title") {
      continue
    }

    const title = richTextToPlainText((property as NotionTitleContainer).title)

    if (title) {
      return title
    }
  }

  return null
}

function richTextToPlainText(tokens: RichTextToken[] = []) {
  return tokens.map((token) => token.plain_text ?? "").join("").trim()
}

async function withMetadataTimeout<T>(promise: Promise<T>) {
  let timeout: ReturnType<typeof setTimeout> | undefined

  try {
    return await Promise.race([
      promise,
      new Promise<null>((resolve) => {
        timeout = setTimeout(() => resolve(null), NOTION_METADATA_TIMEOUT_MS)
      }),
    ])
  } finally {
    if (timeout) {
      clearTimeout(timeout)
    }
  }
}

function getParentReference(value: unknown): ParentReference | null {
  if (!isRecord(value)) {
    return null
  }

  return {
    type: typeof value.type === "string" ? value.type : undefined,
    page_id: typeof value.page_id === "string" ? value.page_id : undefined,
    block_id: typeof value.block_id === "string" ? value.block_id : undefined,
    database_id: typeof value.database_id === "string" ? value.database_id : undefined,
  }
}

function getDatabaseIdFromDataSource(dataSource: unknown) {
  if (!isRecord(dataSource)) {
    return null
  }

  const databaseParent = getParentReference(dataSource.database_parent)

  if (databaseParent?.type === "database_id" && databaseParent.database_id) {
    return databaseParent.database_id
  }

  const parent = getParentReference(dataSource.parent)

  if (parent?.type === "database_id" && parent.database_id) {
    return parent.database_id
  }

  return null
}

async function getPageTitle(
  notion: NonNullable<Awaited<ReturnType<typeof getNotionClient>>>,
  pageId: string,
  parentPageTitleMap: Map<string, string>,
) {
  if (!parentPageTitleMap.has(pageId)) {
    try {
      const page = await withMetadataTimeout(notion.pages.retrieve({ page_id: pageId }))
      parentPageTitleMap.set(pageId, extractPageTitle(page) ?? "Untitled page")
    } catch {
      parentPageTitleMap.set(pageId, "Untitled page")
    }
  }

  return parentPageTitleMap.get(pageId) ?? null
}

async function getParentTitleFromDatabase(
  notion: NonNullable<Awaited<ReturnType<typeof getNotionClient>>>,
  databaseId: string,
  databaseMetadataMap: Map<string, DatabaseMetadata>,
  parentPageTitleMap: Map<string, string>,
) {
  const metadata = databaseMetadataMap.get(databaseId)

  if (!metadata) {
    return null
  }

  if (metadata.parent?.type === "page_id" && metadata.parent.page_id) {
    return getPageTitle(notion, metadata.parent.page_id, parentPageTitleMap)
  }

  return null
}

function getPropertyType(type: string) {
  switch (type) {
    case "title":
    case "rich_text":
    case "number":
    case "select":
    case "files":
      return type
    default:
      return type
  }
}

export async function getSessionProfile() {
  const notion = await getNotionClient()

  if (!notion) {
    return null
  }

  const me = await notion.users.me({})

  return {
    workspaceName: me.name ?? "Connected integration",
    workspaceId: me.id,
  }
}

export async function listAccessibleDataSources() {
  const notion = await getNotionClient()

  if (!notion) {
    throw new Error("Notion session is not connected")
  }

  const results: AccessibleDataSource[] = []
  const databaseMetadataMap = new Map<string, DatabaseMetadata>()
  const parentPageTitleMap = new Map<string, string>()

  let startCursor: string | undefined

  do {
    const response = await notion.search({
      filter: {
        property: "object",
        value: "data_source",
      },
      page_size: 100,
      start_cursor: startCursor,
      sort: {
        timestamp: "last_edited_time",
        direction: "descending",
      },
    })

    const dataSources = response.results.filter(isFullDataSource)
    const missingDatabaseIds = dataSources.reduce<string[]>((accumulator, item) => {
      const databaseId = getDatabaseIdFromDataSource(item)

      if (databaseId && !databaseMetadataMap.has(databaseId) && !accumulator.includes(databaseId)) {
        accumulator.push(databaseId)
      }

      return accumulator
    }, [])

    await Promise.all(
      missingDatabaseIds.map(async (databaseId) => {
        try {
          const database = await withMetadataTimeout(
            notion.databases.retrieve({
              database_id: databaseId,
            })
          )

          if (database && "title" in database) {
            databaseMetadataMap.set(databaseId, {
              title: richTextToPlainText(database.title) || "Untitled database",
              parent: getParentReference(database.parent),
            })
          }
        } catch {
          databaseMetadataMap.set(databaseId, {
            title: "Untitled database",
            parent: null,
          })
        }
      })
    )

    const pageResults = await Promise.all(
      dataSources.map(async (item) => {
        const databaseId = getDatabaseIdFromDataSource(item)
        const parentTitle = databaseId
          ? await getParentTitleFromDatabase(
              notion,
              databaseId,
              databaseMetadataMap,
              parentPageTitleMap,
            )
          : null

        return {
          id: item.id,
          name: richTextToPlainText(item.title) || "Untitled data source",
          databaseId,
          parentTitle,
          url: item.url,
        }
      })
    )

    results.push(...pageResults)

    startCursor = response.has_more ? (response.next_cursor ?? undefined) : undefined
  } while (startCursor)

  return results
}

export async function getDataSourceSchema(dataSourceId: string): Promise<DataSourceSchema> {
  const notion = await getNotionClient()

  if (!notion) {
    throw new Error("Notion session is not connected")
  }

  const dataSource = await notion.dataSources.retrieve({
    data_source_id: dataSourceId,
  })

  if (!("properties" in dataSource)) {
    throw new Error(`Could not load schema for data source: ${dataSourceId}`)
  }

  return {
    id: dataSource.id,
    title: "title" in dataSource ? richTextToPlainText(dataSource.title) || "Untitled data source" : "Untitled data source",
    properties: Object.values(dataSource.properties).map((property) => ({
      id: property.id,
      name: property.name,
      type: getPropertyType(property.type),
    })),
  }
}

export async function createQuizProperty(dataSourceId: string, key: QuizRequirementKey) {
  const notion = await getNotionClient()

  if (!notion) {
    throw new Error("Notion session is not connected")
  }

  await notion.dataSources.update({
    data_source_id: dataSourceId,
    properties: getPropertyCreationPayload(key),
  })

  return getDataSourceSchema(dataSourceId)
}
