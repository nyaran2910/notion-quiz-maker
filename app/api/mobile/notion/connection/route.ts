import { Client } from "@notionhq/client"
import { cookies } from "next/headers"

import { requireCurrentUser } from "@/lib/auth/user"
import { encryptString } from "@/lib/crypto"
import { withTransaction } from "@/lib/db/client"
import { notionConnectionsRepository } from "@/lib/db/repositories/notion-connections"
import { jsonNoStore, verifySameOrigin } from "@/lib/http"
import { NOTION_TOKEN_COOKIE, NOTION_TOKEN_COOKIE_OPTIONS } from "@/lib/notion/session"

export const dynamic = "force-dynamic"

type ConnectNotionPayload = {
  token?: string
}

export async function POST(request: Request) {
  try {
    if (!verifySameOrigin(request)) {
      return jsonNoStore({ error: "Forbidden origin" }, { status: 403 })
    }

    const user = await requireCurrentUser()
    const body = (await request.json()) as ConnectNotionPayload
    const token = body.token?.trim()

    if (!token) {
      return jsonNoStore({ error: "Notion API キーを入力してください。" }, { status: 400 })
    }

    const notion = new Client({ auth: token })
    const me = await notion.users.me({})
    const workspaceName = me.name ?? "Connected integration"

    await withTransaction((client) =>
      notionConnectionsRepository.upsert(client, {
        userId: user.id,
        workspaceId: me.id,
        workspaceName,
        workspaceIconUrl: null,
        encryptedAccessToken: encryptString(token),
      })
    )

    const cookieStore = await cookies()
    cookieStore.set(NOTION_TOKEN_COOKIE, token, NOTION_TOKEN_COOKIE_OPTIONS)

    return jsonNoStore({
      notionConnection: {
        workspaceId: me.id,
        workspaceName,
        connected: true,
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Notion API キーを検証できませんでした。"
    const status = message.includes("App session") ? 401 : 500
    return jsonNoStore({ error: status === 500 ? "Notion API キーを検証できませんでした。Integration の共有設定も確認してください。" : message }, { status })
  }
}

export async function DELETE(request: Request) {
  try {
    if (!verifySameOrigin(request)) {
      return jsonNoStore({ error: "Forbidden origin" }, { status: 403 })
    }

    const user = await requireCurrentUser()

    await withTransaction((client) => notionConnectionsRepository.deleteByUserId(client, user.id))

    const cookieStore = await cookies()
    cookieStore.delete(NOTION_TOKEN_COOKIE)

    return jsonNoStore({ ok: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Notion 接続の解除に失敗しました。"
    const status = message.includes("App session") ? 401 : 500
    return jsonNoStore({ error: message }, { status })
  }
}
