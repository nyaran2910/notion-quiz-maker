import { readdir, readFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

import dotenv from "dotenv"
import pg from "pg"

dotenv.config({ path: ".env.local" })
dotenv.config()

const { Client } = pg

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const migrationsDir = path.resolve(__dirname, "../db/migrations")

function requireDatabaseUrl() {
  const value = process.env.DATABASE_URL?.trim()

  if (!value) {
    throw new Error("DATABASE_URL is not configured")
  }

  return value
}

async function ensureMigrationsTable(client) {
  await client.query(`
    create table if not exists _app_migrations (
      id text primary key,
      applied_at timestamptz not null default now()
    )
  `)
}

async function listMigrationFiles() {
  const entries = await readdir(migrationsDir, { withFileTypes: true })

  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right))
}

async function hasMigrationRun(client, id) {
  const result = await client.query("select 1 from _app_migrations where id = $1", [id])
  return result.rowCount > 0
}

async function runMigration(client, fileName) {
  const filePath = path.join(migrationsDir, fileName)
  const sql = await readFile(filePath, "utf8")

  await client.query("BEGIN")

  try {
    await client.query(sql)
    await client.query("insert into _app_migrations (id) values ($1)", [fileName])
    await client.query("COMMIT")
  } catch (error) {
    await client.query("ROLLBACK")
    throw error
  }
}

async function main() {
  const client = new Client({
    connectionString: requireDatabaseUrl(),
    ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : undefined,
  })

  await client.connect()

  try {
    await ensureMigrationsTable(client)
    const files = await listMigrationFiles()

    for (const fileName of files) {
      if (await hasMigrationRun(client, fileName)) {
        process.stdout.write(`skip ${fileName}\n`)
        continue
      }

      process.stdout.write(`apply ${fileName}\n`)
      await runMigration(client, fileName)
    }

    process.stdout.write("migrations complete\n")
  } finally {
    await client.end()
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
})
