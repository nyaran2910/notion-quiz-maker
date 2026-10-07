import { jsonNoStore } from "@/lib/http"
import { withTransaction } from "@/lib/db/client"
import { notionConnectionsRepository } from "@/lib/db/repositories/notion-connections"
import { getCurrentUser } from "@/lib/auth/user"

export const dynamic = "force-dynamic"

function serializeUser(user: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
  }
}

export async function GET() {
  try {
    const user = await getCurrentUser()

    if (!user) {
      return jsonNoStore({
        user: null,
        notionConnection: null,
      })
    }

    const notionConnection = await withTransaction((client) =>
      notionConnectionsRepository.findLatestForUser(client, user.id)
    )

    return jsonNoStore({
      user: serializeUser(user),
      notionConnection: notionConnection
        ? {
            workspaceId: notionConnection.workspaceId,
            workspaceName: notionConnection.workspaceName,
            connected: true,
          }
        : null,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load mobile session"
    return jsonNoStore({ error: message }, { status: 500 })
  }
}
