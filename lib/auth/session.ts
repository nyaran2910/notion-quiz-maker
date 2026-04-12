export const APP_SESSION_COOKIE = "app_session"

export const APP_SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  path: "/",
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  maxAge: 60 * 60 * 24 * 30,
  priority: "high" as const,
}

export const APP_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30
