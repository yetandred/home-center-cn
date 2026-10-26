import { headers } from "next/headers"
import { redirect } from "next/navigation"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { MIN_PASSWORD_LENGTH, PASSWORD_ERROR_TEXT } from "@/lib/password-change"
import { clientIp } from "@/lib/login-throttle"
import { RESET_TOKEN_MINUTES, completePasswordReset } from "@/lib/password-reset"
import { completeDeps } from "@/lib/password-reset-server"

async function resetPassword(formData: FormData) {
  "use server"
  const token = String(formData.get("token") ?? "")
  const result = await completePasswordReset(
    { token, next: formData.get("newPassword"), confirm: formData.get("confirm") },
    clientIp(await headers()),
    completeDeps
  )
  if (result === "ok") redirect("/login?message=password-changed")
  // The token goes back in the URL so a typo doesn't mean opening the email again.
  redirect(`/reset-password?error=${result}${result === "invalid" || result === "throttled" ? "" : `&token=${encodeURIComponent(token)}`}`)
}

const ERRORS: Record<string, string> = {
  short: PASSWORD_ERROR_TEXT.short,
  mismatch: PASSWORD_ERROR_TEXT.mismatch,
  invalid: `该链接已过期或已被使用。链接仅可使用一次，${RESET_TOKEN_MINUTES} 分钟内有效。`,
  throttled: "尝试次数过多，请等待 15 分钟后再试。",
}

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string; error?: string }> }) {
  const { token, error } = await searchParams
  const errorText = error ? ERRORS[error] : null

  return (
    <div className="min-h-svh flex items-center justify-center bg-muted/40 p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="font-heading text-2xl font-semibold tracking-tight">设置新密码</h1>
        </div>

        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-base">新密码</CardTitle>
            {errorText && <CardDescription className="text-destructive">{errorText}</CardDescription>}
          </CardHeader>
          <CardContent className="space-y-4">
            <form action={resetPassword} className="space-y-4">
              {/* The emailed link fills this in; it's shown only when someone has to paste a code. */}
              {token ? (
                <input type="hidden" name="token" value={token} />
              ) : (
                <div className="space-y-1.5">
                  <Label htmlFor="token">重置码</Label>
                  <Input id="token" name="token" autoComplete="off" required />
                </div>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="newPassword">新密码</Label>
                <Input id="newPassword" name="newPassword" type="password" autoComplete="new-password" required minLength={MIN_PASSWORD_LENGTH} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="confirm">确认密码</Label>
                <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required minLength={MIN_PASSWORD_LENGTH} />
              </div>
              <Button type="submit" className="w-full">设置密码</Button>
            </form>
            <Link href="/login" className="block text-center text-sm text-muted-foreground hover:underline">返回登录</Link>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
