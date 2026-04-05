import { isFullDataSource } from "@notionhq/client"

import { getNotionClient } from "./client"
import { getQuizRequirement, type QuizRequirementKey } from "./quiz-schema"

type RichTextToken = {
  plain_text?: string
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
  databaseTitle: string
  url: string
  lastEditedTime: string
}

export type DataSourceSchema = {
  id: string
  title: string
  properties: DataSourceProperty[]
}

function getPropertyCreationPayload(key: QuizRequirementKey) {
  const requirement = getQuizRequirement(key)

  switch (key) {
    case "accuracy":
      return {
        [requirement.suggestedName]: {
          name: requirement.suggestedName,
          type: "number" as const,
          number: {
            format: "percent",
          },
        },
      }
    case "askedCount":
      return {
        [requirement.suggestedName]: {
          name: requirement.suggestedName,
          type: "number" as const,
          number: {
            format: "number",
          },
        },
      }
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
    case "priority":
      return {
        [requirement.suggestedName]: {
          name: requirement.suggestedName,
          type: "select" as const,
          select: {
            options: [
              { name: "High", color: "red" as const },
              { name: "Mid", color: "yellow" as const },
              { name: "Low", color: "gray" as const },
            ],
          },
        },
      }
  }
}

function richTextToPlainText(tokens: RichTextToken[] = []) {
  return tokens.map((token) => token.plain_text ?? "").join("").trim()
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
  const databaseTitleMap = new Map<string, string>()

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

      if (databaseId && !databaseTitleMap.has(databaseId)) {
        accumulator.push(databaseId)
      }

      return accumulator
    }, [])

    for (const databaseId of missingDatabaseIds) {
      const database = await notion.databases.retrieve({
        database_id: databaseId,
      })

      if ("title" in database) {
        databaseTitleMap.set(databaseId, richTextToPlainText(database.title) || "Untitled database")
      }
    }

    for (const item of dataSources) {
      const databaseId = item.database_parent.type === "database_id" ? item.database_parent.database_id : null
      const databaseTitle = databaseId ? (databaseTitleMap.get(databaseId) ?? "Untitled database") : "External source"

      results.push({
        id: item.id,
        name: richTextToPlainText(item.title) || "Untitled data source",
        databaseId,
        databaseTitle,
        url: item.url,
        lastEditedTime: item.last_edited_time,
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
