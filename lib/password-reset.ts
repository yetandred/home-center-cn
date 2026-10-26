import type { LoginThrottle } from "./login-throttle"
import { isEmailAddress } from "./email-address"
import { MIN_PASSWORD_LENGTH } from "./password-change"

// "Forgot password": an emailed one-time link to /reset-password. Kept free of
// Prisma, nodemailer and next so it can be tested directly, like
// lib/auth-credentials.ts.
//
// The link carries a random token; only its hash is stored. Asking for a link
// changes nothing about the account, so nobody can lock someone out by typing
// their address — the password changes only when the link is used.

/** How long an emailed link works. */
export const RESET_TOKEN_MINUTES = 15
export const RESET_TOKEN_MS = RESET_TOKEN_MINUTES * 60_000

// Per address and per visitor, to stop the inbox being flooded with links.
export const RESET_REQUEST_LIMITS = { perEmail: 3, perIp: 10, windowMs: 60 * 60_000 }
// Failed token attempts per visitor. The token is 256 random bits, so this is housekeeping.
export const RESET_USE_LIMITS = { perEmail: 10, perIp: 10, windowMs: 15 * 60_000 }

export type RequestDeps = {
  mailReady(): Promise<boolean>
  findUser(email: string): Promise<{ id: string; email: string; name: string | null } | null>
  /** Replaces any link the user already has. Stores the hash, never the token. */
  storeToken(userId: string, tokenHash: string, expiresAt: Date): Promise<void>
  send(message: { to: string; subject: string; text: string; html: string }): Promise<void>
  generateToken(): string
  hashToken(token: string): string
  /** The address people reach HomeCenter at, from AUTH_URL; null when it isn't set. */
  appUrl(): Promise<string | null>
  now(): Date
  throttle: LoginThrottle
}

/**
 * "sent" is also the answer for an address with no account, so the page can't be
 * used to find out who has one.
 */
export type RequestResult = "sent" | "throttled" | "unavailable" | "invalid"

export function resetEmail(name: string | null, token: string, appUrl: string | null) {
  const link = appUrl ? `${appUrl}/reset-password?token=${encodeURIComponent(token)}` : null
  const greeting = name ? `${name}，您好：` : "您好："
  const how = link
    ? `请通过以下链接设置新密码：\n${link}`
    : `打开 HomeCenter 的重置页面（先登录，再点击“重置密码”），输入以下代码：\n${token}`
  const text = [
    greeting,
    "",
    "收到了重置您 HomeCenter 账户密码的请求。",
    how,
    "",
    `链接仅可使用一次，${RESET_TOKEN_MINUTES} 分钟后失效。`,
    "如果您没有发起此请求，请忽略本邮件——您的密码未被更改。",
  ].join("\n")
  // The name is user-entered; the link and token are URL-safe.
  const safeName = name?.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
  const html =
    `<p>${safeName ? `${safeName}，您好：` : "您好："}</p>` +
    "<p>收到了重置您 HomeCenter 账户密码的请求。</p>" +
    (link
      ? `<p><a href="${link}">设置新密码</a></p>`
      : `<p>打开 HomeCenter 的重置页面（先登录，再点击“重置密码”），输入以下代码：<br><code>${token}</code></p>`) +
    `<p>链接仅可使用一次，${RESET_TOKEN_MINUTES} 分钟后失效。</p>` +
    "<p>如果您没有发起此请求，请忽略本邮件——您的密码未被更改。</p>"
  return { subject: "重置您的 HomeCenter 密码", text, html }
}

export async function requestPasswordReset(emailInput: unknown, ip: string, deps: RequestDeps): Promise<RequestResult> {
  if (!(await deps.mailReady())) return "unavailable"
  const email = typeof emailInput === "string" ? emailInput.trim() : ""
  if (!isEmailAddress(email)) return "invalid"

  if (deps.throttle.isBlocked(email, ip)) return "throttled"
  // Every request counts, found or not.
  deps.throttle.recordFailure(email, ip)

  const user = await deps.findUser(email)
  if (!user) return "sent"

  const token = deps.generateToken()
  try {
    await deps.send({ to: user.email, ...resetEmail(user.name, token, await deps.appUrl()) })
  } catch (error) {
    console.error("[password-reset] could not send the email:", error instanceof Error ? error.message : error)
    return "sent"
  }
  await deps.storeToken(user.id, deps.hashToken(token), new Date(deps.now().getTime() + RESET_TOKEN_MS))
  return "sent"
}

export type CompleteDeps = {
  hashToken(token: string): string
  /** Removes the link if it exists and hasn't expired, and says whose it was. Atomic, so a link works once. */
  consumeToken(tokenHash: string, now: Date): Promise<{ userId: string } | null>
  /** Hashes and stores it, clears the must-change flag, ends the account's sessions and removes its other links. */
  setPassword(userId: string, password: string): Promise<void>
  now(): Date
  throttle: LoginThrottle
}

export type CompleteResult = "ok" | "invalid" | "short" | "mismatch" | "throttled"

export async function completePasswordReset(
  input: { token: unknown; next: unknown; confirm: unknown },
  ip: string,
  deps: CompleteDeps
): Promise<CompleteResult> {
  if (deps.throttle.isBlocked(ip, ip)) return "throttled"

  const token = typeof input.token === "string" ? input.token.trim() : ""
  const next = typeof input.next === "string" ? input.next : ""
  const confirm = typeof input.confirm === "string" ? input.confirm : ""

  // Checked before the link is used up, so a typo doesn't cost the user their link.
  if (next.length < MIN_PASSWORD_LENGTH) return "short"
  if (next !== confirm) return "mismatch"

  const found = token ? await deps.consumeToken(deps.hashToken(token), deps.now()) : null
  if (!found) {
    deps.throttle.recordFailure(ip, ip)
    return "invalid"
  }
  await deps.setPassword(found.userId, next)
  return "ok"
}
