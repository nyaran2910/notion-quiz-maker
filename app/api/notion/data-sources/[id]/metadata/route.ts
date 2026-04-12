import { jsonNoStore, verifySameOrigin } from "@/lib/http"
import { resetQuizSourceMetadata } from "@/lib/quiz/service"

export const dynamic = "force-dynamic"

export async function DELETE(request: Request, context: RouteContext<"/api/notion/data-sources/[id]/metadata">) {
  try {
    if (!verifySameOrigin(request)) {
      return jsonNoStore({ error: "Forbidden origin" }, { status: 403 })
    }

    const { id } = await context.params
    const result = await resetQuizSourceMetadata(id)

    return jsonNoStore({ ok: true, ...result })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to reset data source metadata"
    const status = message.includes("session") ? 401 : 500

    return jsonNoStore({ error: message }, { status })
  }
}
