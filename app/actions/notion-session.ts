"use server"

import { Client } from "@notionhq/client"
import { cookies } from "next/headers"
import { revalidatePath } from "next/cache"

import { requireCurrentUser } from "@/lib/auth/user"
import { NOTION_TOKEN_COOKIE, NOTION_TOKEN_COOKIE_OPTIONS } from "@/lib/notion/session"

export type NotionSessionActionState = {
  error: string | null
}

export async function connectNotion(
  _prevState: NotionSessionActionState,
  formData: FormData
): Promise<NotionSessionActionState> {
  try {
    await requireCurrentUser()
  } catch {
    return { error: "先にログインしてください。" }
  }

  const token = formData.get("token")

  if (typeof token !== "string" || token.trim().length === 0) {
    return { error: "Notion API キーを入力してください。" }
  }

  try {
    const notion = new Client({ auth: token.trim() })
    await notion.users.me({})

    const cookieStore = await cookies()
    cookieStore.set(NOTION_TOKEN_COOKIE, token.trim(), NOTION_TOKEN_COOKIE_OPTIONS)
    revalidatePath("/")
    revalidatePath("/setup")
    revalidatePath("/quiz")

    return { error: null }
  } catch {
    return { error: "Notion API キーを検証できませんでした。Integration の共有設定も確認してください。" }
  }
}

export async function disconnectNotion() {
  await requireCurrentUser()
  const cookieStore = await cookies()
  cookieStore.delete(NOTION_TOKEN_COOKIE)
  revalidatePath("/")
  revalidatePath("/setup")
  revalidatePath("/quiz")
}
