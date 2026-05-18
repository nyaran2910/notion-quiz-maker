import { jsonNoStore, verifySameOrigin } from "@/lib/http"
import { endQuizSession } from "@/lib/quiz/service"

export const dynamic = "force-dynamic"

type EndQuizPayload = {
  sessionId?: string
}

export async function POST(request: Request) {
  try {
    if (!verifySameOrigin(request)) {
      return jsonNoStore({ error: "Forbidden origin" }, { status: 403 })
    }

    const body = (await request.json()) as EndQuizPayload

    if (!body.sessionId) {
      return jsonNoStore({ error: "Missing session id" }, { status: 400 })
    }

    const session = await endQuizSession(body.sessionId)
    return jsonNoStore({ session })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to end quiz session"
    const status = message.includes("not connected") ? 401 : 500

    return jsonNoStore({ error: message }, { status })
  }
}
