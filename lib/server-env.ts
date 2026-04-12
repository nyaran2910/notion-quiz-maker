import "server-only"

function readOptionalEnv(name: string) {
  const value = process.env[name]?.trim()
  return value && value.length > 0 ? value : null
}

export function getServerEnv() {
  return {
    databaseUrl: readOptionalEnv("DATABASE_URL"),
    notionApiKey: readOptionalEnv("NOTION_API_KEY"),
    notionTokenEncryptionKey: readOptionalEnv("NOTION_TOKEN_ENCRYPTION_KEY"),
  }
}

export function requireDatabaseUrl() {
  const { databaseUrl } = getServerEnv()

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not configured")
  }

  return databaseUrl
}
