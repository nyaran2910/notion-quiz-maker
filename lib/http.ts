import { NextResponse } from "next/server"

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
  Pragma: "no-cache",
  Expires: "0",
  Vary: "Cookie",
} as const

export function jsonNoStore(body: unknown, init?: ResponseInit) {
  return NextResponse.json(body, {
    ...init,
    headers: {
      ...NO_STORE_HEADERS,
      ...init?.headers,
    },
  })
}

export function verifySameOrigin(request: Request) {
  const origin = request.headers.get("origin")

  if (!origin) {
    return true
  }

  const forwardedProto = request.headers.get("x-forwarded-proto")
  const forwardedHost = request.headers.get("x-forwarded-host")
  const host = forwardedHost ?? request.headers.get("host")

  if (!host) {
    return false
  }

  const requestUrl = new URL(request.url)
  const expectedProtocol = forwardedProto ?? requestUrl.protocol.replace(":", "")
  const expectedOrigin = `${expectedProtocol}://${host}`

  return origin === expectedOrigin
}
