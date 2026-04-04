import { Client } from "@notionhq/client"
import { cookies } from "next/headers"

import { NOTION_TOKEN_COOKIE } from "./session"

export async function getNotionTokenFromSession() {
  const cookieStore = await cookies()
  return cookieStore.get(NOTION_TOKEN_COOKIE)?.value ?? null
}

export async function getNotionClient() {
  const token = await getNotionTokenFromSession()

  if (!token) {
    return null
  }

  return new Client({ auth: token })
}
