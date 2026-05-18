import { jsonNoStore, verifySameOrigin } from "@/lib/http"
import type { QuizSourceConfig } from "@/lib/notion/quiz-types"
import { syncQuizSources } from "@/lib/quiz/service"

export const dynamic = "force-dynamic"

type SyncPayload = {
  sources?: QuizSourceConfig[]
}

export async function POST(request: Request) {
  try {
    if (!verifySameOrigin(request)) {
      return jsonNoStore({ error: "Forbidden origin" }, { status: 403 })
    }

    const body = (await request.json()) as SyncPayload

    if (!body.sources || body.sources.length === 0) {
      return jsonNoStore({ error: "Missing sync sources" }, { status: 400 })
    }

    const result = await syncQuizSources(body.sources)
    return jsonNoStore(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to sync quiz sources"
    const status = message.includes("not connected") ? 401 : 500

    return jsonNoStore({ error: message }, { status })
  }
}
