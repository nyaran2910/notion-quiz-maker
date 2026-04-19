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

function getParentReference(value: unknown): ParentReference | null {
  if (!isRecord(value)) {
    return null
  }

  return {
    type: typeof value.type === "string" ? value.type : undefined,
    page_id: typeof value.page_id === "string" ? value.page_id : undefined,
    block_id: typeof value.block_id === "string" ? value.block_id : undefined,
  }
}

async function getPageTitle(
  notion: NonNullable<Awaited<ReturnType<typeof getNotionClient>>>,
  pageId: string,
  parentPageTitleMap: Map<string, string>,
) {
  if (!parentPageTitleMap.has(pageId)) {
    const page = await notion.pages.retrieve({ page_id: pageId })
    parentPageTitleMap.set(pageId, extractPageTitle(page) ?? "Untitled page")
  }

  return parentPageTitleMap.get(pageId) ?? null
}

async function getPageIdFromBlock(
  notion: NonNullable<Awaited<ReturnType<typeof getNotionClient>>>,
  blockId: string,
  blockPageIdMap: Map<string, string | null>,
): Promise<string | null> {
  if (blockPageIdMap.has(blockId)) {
    return blockPageIdMap.get(blockId) ?? null
  }

  const block = await notion.blocks.retrieve({ block_id: blockId })
  const parent = getParentReference(isRecord(block) && "parent" in block ? block.parent : null)

  let pageId: string | null = null

  if (parent?.type === "page_id") {
    pageId = parent.page_id ?? null
  } else if (parent?.type === "block_id" && parent.block_id) {
    pageId = await getPageIdFromBlock(notion, parent.block_id, blockPageIdMap)
  }

  blockPageIdMap.set(blockId, pageId)

  return pageId
}

async function getParentTitleFromDatabase(
  notion: NonNullable<Awaited<ReturnType<typeof getNotionClient>>>,
  databaseId: string,
  databaseMetadataMap: Map<string, DatabaseMetadata>,
  parentPageTitleMap: Map<string, string>,
  blockPageIdMap: Map<string, string | null>,
) {
  const metadata = databaseMetadataMap.get(databaseId)

  if (!metadata) {
    return null
  }

  if (metadata.parent?.type === "page_id" && metadata.parent.page_id) {
    return getPageTitle(notion, metadata.parent.page_id, parentPageTitleMap)
  }

  if (metadata.parent?.type === "block_id" && metadata.parent.block_id) {
    const pageId = await getPageIdFromBlock(notion, metadata.parent.block_id, blockPageIdMap)

    if (pageId) {
      return getPageTitle(notion, pageId, parentPageTitleMap)
    }
  }

  return metadata.title
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
  const blockPageIdMap = new Map<string, string | null>()

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
        const databaseId = item.database_parent.type === "database_id" ? item.database_parent.database_id : null

        if (databaseId && !databaseMetadataMap.has(databaseId)) {
          accumulator.push(databaseId)
        }

      return accumulator
    }, [])

      for (const databaseId of missingDatabaseIds) {
        const database = await notion.databases.retrieve({
          database_id: databaseId,
        })

        if ("title" in database) {
          databaseMetadataMap.set(databaseId, {
            title: richTextToPlainText(database.title) || "Untitled database",
            parent: getParentReference(database.parent),
          })
        }
      }

      for (const item of dataSources) {
        const databaseId = item.database_parent.type === "database_id" ? item.database_parent.database_id : null
        const parentTitle = databaseId
          ? await getParentTitleFromDatabase(
              notion,
              databaseId,
              databaseMetadataMap,
              parentPageTitleMap,
              blockPageIdMap,
            )
          : null

        results.push({
        id: item.id,
        name: richTextToPlainText(item.title) || "Untitled data source",
        databaseId,
        parentTitle,
        url: item.url,
      })
    }

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
