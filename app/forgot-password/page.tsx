import { headers } from "next/headers"
import { redirect } from "next/navigation"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Home } from "lucide-react"
import { clientIp } from "@/lib/login-throttle"
import { RESET_TOKEN_MINUTES, requestPasswordReset } from "@/lib/password-reset"
import { passwordResetAvailable, requestDeps } from "@/lib/password-reset-server"

async function request(formData: FormData) {
  "use server"
  const result = await requestPasswordReset(formData.get("email"), clientIp(await headers()), requestDeps)
  redirect(`/forgot-password?status=${result}`)
}

const MESSAGES: Record<string, { text: string; ok?: boolean }> = {
  sent: {
    text: `如果该邮箱对应某个账户，重置链接将很快发送到您的邮箱。链接仅可使用一次，${RESET_TOKEN_MINUTES} 分钟内有效。`,
    ok: true,
  },
  throttled: { text: "重置请求过于频繁，请等待一小时后再试。" },
  invalid: { text: "请输入有效的邮箱地址。" },
}

export default async function ForgotPasswordPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status } = await searchParams
  // No mail server, no reset: send people back to sign in.
  if (!(await passwordResetAvailable())) redirect("/login")
  const message = status ? MESSAGES[status] : undefined

  return (
    <div className="min-h-svh flex items-center justify-center bg-muted/40 p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Home className="h-5 w-5" />
          </div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">HomeCenter</h1>
          <p className="text-sm text-muted-foreground">重置密码</p>
        </div>

        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-base">忘记密码？</CardTitle>
            <CardDescription className={message ? (message.ok ? "text-emerald-700 dark:text-emerald-400" : "text-destructive") : undefined}>
              {message?.text ?? "请输入您的邮箱，我们会向您发送设置新密码的链接。"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <form action={request} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email">邮箱</Label>
                <Input id="email" name="email" type="email" autoComplete="email" required />
              </div>
              <Button type="submit" className="w-full">向我发送重置链接</Button>
            </form>
            <Link href="/login" className="block text-center text-sm text-muted-foreground hover:underline">返回登录</Link>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
