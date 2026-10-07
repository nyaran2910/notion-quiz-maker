import { loadQuestionImageUrl } from "@/lib/notion/quiz"

export const dynamic = "force-dynamic"

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
  Pragma: "no-cache",
  Expires: "0",
  Vary: "Cookie",
} as const

function textNoStore(message: string, status: number) {
  return new Response(message, {
    status,
    headers: NO_STORE_HEADERS,
  })
}

function getImageIndex(value: string | null) {
  if (!value) {
    return null
  }

  const imageIndex = Number(value)

  if (!Number.isInteger(imageIndex) || imageIndex < 0) {
    return null
  }

  return imageIndex
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const pageId = searchParams.get("pageId")
    const propertyId = searchParams.get("propertyId")
    const imageIndex = getImageIndex(searchParams.get("index"))

    if (!pageId || !propertyId || imageIndex === null) {
      return textNoStore("Missing image parameters", 400)
    }

    const imageUrl = await loadQuestionImageUrl(pageId, propertyId, imageIndex)

    if (!imageUrl) {
      return textNoStore("Image not found", 404)
    }

    const targetUrl = new URL(imageUrl)

    if (targetUrl.protocol !== "https:" && targetUrl.protocol !== "http:") {
      return textNoStore("Unsupported image URL", 400)
    }

    return new Response(null, {
      status: 302,
      headers: {
        ...NO_STORE_HEADERS,
        Location: targetUrl.toString(),
      },
    })
  } catch (error) {
    const message = error instanceof Error && error.message.includes("not connected")
      ? "Notion session is not connected"
      : "Failed to load image"
    const status = message.includes("not connected") ? 401 : 500

    return textNoStore(message, status)
  }
}
