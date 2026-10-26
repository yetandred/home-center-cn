import { signIn } from "@/auth"
import { AuthError, CredentialsSignin } from "next-auth"
import { redirect } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Home } from "lucide-react"
import Link from "next/link"
import { loadMailConfig } from "@/lib/notifications/mail-config"
import { isMailConfigured } from "@/lib/notifications/mailer"

async function login(formData: FormData) {
  "use server"
  try {
    await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      redirectTo: "/",
    })
  } catch (error) {
    if (error instanceof CredentialsSignin && error.code === "rate_limited") {
      redirect("/login?error=locked")
    }
    if (error instanceof AuthError) {
      redirect("/login?error=1")
    }
    throw error
  }
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string }>
}) {
  const { error, message } = await searchParams
  // Offered after a failed sign-in, and only when there's a mail server to send the new password.
  const mailConfig = error === "1" ? await loadMailConfig() : null
  const canReset = mailConfig !== null && isMailConfigured(mailConfig) && !mailConfig.passwordUnreadable

  return (
    <div className="min-h-svh flex items-center justify-center bg-muted/40 p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Home className="h-5 w-5" />
          </div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">HomeCenter</h1>
          <p className="text-sm text-muted-foreground">登录您的账户</p>
        </div>

        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-base">欢迎回来</CardTitle>
            {error && (
              <CardDescription className="text-destructive">
                {error === "locked"
                  ? "失败次数过多，请等待 15 分钟后再试。"
                  : "邮箱或密码不正确。"}
              </CardDescription>
            )}
            {!error && message === "password-changed" && (
              <CardDescription className="text-emerald-700 dark:text-emerald-400">
                密码已修改，请使用新密码登录。
              </CardDescription>
            )}
          </CardHeader>
          <CardContent>
            <form action={login} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email">邮箱</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  placeholder="admin@localhost"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password">密码</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                />
              </div>
              <Button type="submit" className="w-full">
                登录
              </Button>
              {canReset && (
                <Link href="/forgot-password" className="block text-center text-sm text-muted-foreground hover:underline">
                  重置密码
                </Link>
              )}
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
