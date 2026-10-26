"use client"

import { useState, useTransition } from "react"
import { useForm } from "react-hook-form"
import { toast } from "sonner"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Form, FormField, FormItem, FormLabel, FormControl, FormDescription, FormMessage } from "@/components/ui/form"
import { updateMailSettings, sendTestEmail, testMailConnection } from "@/lib/actions/mail-settings"
import type { MailFieldSource } from "@/lib/notifications/mail-config"

type Sources = Record<string, MailFieldSource>

const SECURE_LABELS: Record<string, string> = {
  auto: "自动（465 端口使用 TLS）",
  true: "始终使用 TLS",
  false: "从不使用 TLS",
}

/** Says where a value came from, so an env-provided default isn't a mystery. */
function SourceNote({ source }: { source: MailFieldSource }) {
  if (source === "env") return <FormDescription className="text-xs">来自环境变量。</FormDescription>
  if (source === "default") return <FormDescription className="text-xs">使用默认值。</FormDescription>
  return null
}

export function MailSettings({
  initial,
  sources,
  hasStoredPassword,
  passwordUnreadable,
  configured,
  dryRun,
}: {
  initial: { host: string; port: string; username: string; secure: string; fromAddress: string; digestHour: string; publicUrl: string }
  sources: Sources
  hasStoredPassword: boolean
  passwordUnreadable: boolean
  configured: boolean
  dryRun: boolean
}) {
  const form = useForm({ defaultValues: { ...initial, password: "" } })
  const [clearPassword, setClearPassword] = useState(false)
  const [testing, startTest] = useTransition()

  async function onSubmit(values: typeof initial & { password: string }) {
    const result = await updateMailSettings({
      ...values,
      secure: values.secure as "auto" | "true" | "false",
      clearPassword,
    })
    if (result?.error) {
      toast.error(result.error)
      return
    }
    toast.success("邮件设置已保存。")
    form.setValue("password", "")
    setClearPassword(false)
  }

  function runTest(kind: "connection" | "email") {
    startTest(async () => {
      // Send what's typed, so a setting can be tried before it's committed.
      const values = form.getValues()
      const draft = {
        ...values,
        secure: values.secure as "auto" | "true" | "false",
        clearPassword,
      }
      const result = kind === "connection" ? await testMailConnection(draft) : await sendTestEmail(draft)
      if ("error" in result && result.error) {
        // pre-line so the guidance appended to a provider's raw reply keeps its
        // paragraph break instead of running together.
        toast.error(result.error, { duration: 15000, style: { whiteSpace: "pre-line" } })
        return
      }
      if (kind === "connection") toast.success("已连接到邮件服务器。")
      else {
        const sent = result as { sentTo?: string; dryRun?: boolean }
        toast.success(
          sent.dryRun
            ? "试运行 — 已记录日志而非发送（MAIL_DRY_RUN 已开启）。"
            : `测试邮件已发送至 ${sent.sentTo}。`
        )
      }
    })
  }

  return (
    <Card className="py-5">
      <CardHeader className="px-5">
        <CardTitle className="flex items-center gap-2">
          邮件服务器
          {configured ? <Badge variant="secondary">已配置</Badge> : <Badge variant="outline">未配置</Badge>}
          {dryRun && <Badge variant="outline">试运行</Badge>}
        </CardTitle>
        <CardDescription>
          用于发送提醒邮件。此处设置的值会覆盖对应的 <code className="text-xs">SMTP_*</code>{" "}
          环境变量；清空某项即可回退到环境变量的值。
        </CardDescription>
      </CardHeader>
      <CardContent className="px-5">
        {passwordUnreadable && (
          <p className="mb-4 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            已保存的密码无法解密 — 通常是 <code className="text-xs">AUTH_SECRET</code>{" "}
            发生了变化。请重新输入以恢复邮件发送。
          </p>
        )}
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="host" render={({ field }) => (
                <FormItem>
                  <FormLabel>服务器</FormLabel>
                  <FormControl><Input placeholder="smtp.gmail.com" {...field} /></FormControl>
                  <SourceNote source={sources.host} />
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="port" render={({ field }) => (
                <FormItem>
                  <FormLabel>端口</FormLabel>
                  <FormControl><Input type="number" placeholder="587" {...field} /></FormControl>
                  <SourceNote source={sources.port} />
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="username" render={({ field }) => (
                <FormItem>
                  <FormLabel>用户名</FormLabel>
                  <FormControl><Input placeholder="you@gmail.com" {...field} /></FormControl>
                  <FormDescription className="text-xs">使用无需认证的中继时留空。</FormDescription>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="password" render={({ field }) => (
                <FormItem>
                  <FormLabel>密码</FormLabel>
                  <FormControl>
                    <Input
                      type="password"
                      autoComplete="new-password"
                      placeholder={hasStoredPassword ? "••••••••（未更改）" : ""}
                      disabled={clearPassword}
                      {...field}
                    />
                  </FormControl>
                  <FormDescription className="text-xs">
                    加密存储。使用 Gmail 或 iCloud 时请填写应用专用密码。
                    {hasStoredPassword && (
                      <button
                        type="button"
                        className="ml-1 underline hover:text-foreground"
                        onClick={() => setClearPassword((c) => !c)}
                      >
                        {clearPassword ? "保留已保存的密码" : "移除已保存的密码"}
                      </button>
                    )}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="secure" render={({ field }) => (
                <FormItem>
                  <FormLabel>加密方式</FormLabel>
                  <Select value={field.value} onValueChange={(v) => field.onChange(v ?? field.value)}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue>{(v: string) => SECURE_LABELS[v] ?? v}</SelectValue>
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {Object.entries(SECURE_LABELS).map(([value, label]) => (
                        <SelectItem key={value} value={value}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="digestHour" render={({ field }) => (
                <FormItem>
                  <FormLabel>汇总发送时间</FormLabel>
                  <FormControl><Input type="number" min={0} max={23} placeholder="8" {...field} /></FormControl>
                  <FormDescription className="text-xs">每日和每周邮件的发送时间。</FormDescription>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="fromAddress" render={({ field }) => (
                <FormItem className="col-span-2">
                  <FormLabel>发件人地址</FormLabel>
                  <FormControl><Input placeholder="HomeCenter <no-reply@homecenter.local>" {...field} /></FormControl>
                  <FormDescription className="text-xs">
                    许多服务商要求该地址与登录账户一致。
                  </FormDescription>
                  <SourceNote source={sources.from} />
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="publicUrl" render={({ field }) => (
                <FormItem className="col-span-2">
                  <FormLabel>公开访问地址</FormLabel>
                  <FormControl><Input placeholder="https://home.example.com" {...field} /></FormControl>
                  <FormDescription className="text-xs">
                    邮件中链接（如密码重置）指向的地址。请使用成员在浏览器中输入的地址。
                  </FormDescription>
                  <SourceNote source={sources.publicUrl} />
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            <div className="flex items-center gap-2">
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? "保存中…" : "保存"}
              </Button>
              <Button type="button" variant="outline" disabled={testing} onClick={() => runTest("connection")}>
                测试连接
              </Button>
              <Button type="button" variant="outline" disabled={testing} onClick={() => runTest("email")}>
                发送测试邮件
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              测试使用上方填写的配置，保存前即可试运行。密码留空时将沿用已保存的密码。
            </p>
          </form>
        </Form>
      </CardContent>
    </Card>
  )
}
