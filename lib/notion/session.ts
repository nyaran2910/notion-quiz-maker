export const NOTION_TOKEN_COOKIE = "notion_token"

export const NOTION_TOKEN_COOKIE_OPTIONS = {
  httpOnly: true,
  path: "/",
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
}
