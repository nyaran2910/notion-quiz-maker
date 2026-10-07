import "server-only"

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto"

import { getServerEnv, requireDatabaseUrl } from "@/lib/server-env"

const ALGORITHM = "aes-256-gcm"

function getEncryptionKey() {
  const { notionTokenEncryptionKey } = getServerEnv()
  const seed = notionTokenEncryptionKey ?? requireDatabaseUrl()
  return createHash("sha256").update(seed).digest()
}

export function encryptString(value: string) {
  const iv = randomBytes(12)
  const cipher = createCipheriv(ALGORITHM, getEncryptionKey(), iv)
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()])
  const authTag = cipher.getAuthTag()

  return Buffer.concat([iv, authTag, encrypted])
}

export function decryptString(payload: Buffer) {
  const iv = payload.subarray(0, 12)
  const authTag = payload.subarray(12, 28)
  const encrypted = payload.subarray(28)
  const decipher = createDecipheriv(ALGORITHM, getEncryptionKey(), iv)
  decipher.setAuthTag(authTag)

  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8")
}
