import "server-only"

import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from "pg"

import { requireDatabaseUrl } from "@/lib/server-env"

let pool: Pool | null = null

function createPool() {
  return new Pool({
    connectionString: requireDatabaseUrl(),
    max: 10,
    ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : undefined,
  })
}

export function getPool() {
  pool ??= createPool()
  return pool
}

export async function query<T extends QueryResultRow>(text: string, values: unknown[] = []) {
  return getPool().query<T>(text, values)
}

export async function withTransaction<T>(callback: (client: PoolClient) => Promise<T>) {
  const client = await getPool().connect()

  try {
    await client.query("BEGIN")
    const result = await callback(client)
    await client.query("COMMIT")
    return result
  } catch (error) {
    await client.query("ROLLBACK")
    throw error
  } finally {
    client.release()
  }
}

export async function execute<T extends QueryResultRow>(
  client: PoolClient,
  text: string,
  values: unknown[] = []
) {
  return client.query<T>(text, values)
}

export type { PoolClient, QueryResult }
