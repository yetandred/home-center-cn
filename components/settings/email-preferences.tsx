"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { updateEmailDigest } from "@/lib/actions/users"
import type { EmailDigest } from "@/app/generated/prisma/client"

const OPTIONS: { value: EmailDigest; label: string; hint: string }[] = [
  { value: "OFF", label: "关闭", hint: "不发送邮件，站内通知铃仍可用。" },
  { value: "ASAP", label: "尽快发送", hint: "在下一次检查时发送，并非即时。" },
  { value: "DAILY", label: "每天", hint: "有待办事项时，每天发送一封汇总邮件。" },
  { value: "WEEKLY", label: "每周", hint: "有待办事项时，每周发送一封汇总邮件。" },
]

export function EmailPreferences({
  digest,
  email,
  mailConfigured,
  receivesNotifications,
}: {
  digest: EmailDigest
  email: string
  mailConfigured: boolean
  receivesNotifications: boolean
}) {
  const [value, setValue] = useState<EmailDigest>(digest)
  const [pending, startTransition] = useTransition()

  function change(next: string | null) {
    if (!next || next === value) return
    const previous = value
    setValue(next as EmailDigest)
    startTransition(async () => {
      const result = await updateEmailDigest(next)
      if (result?.error) {
        setValue(previous) // put the control back if the server refused
        toast.error(result.error)
      } else {
        toast.success("邮件偏好已保存。")
      }
    })
  }

  const hint = OPTIONS.find((o) => o.value === value)?.hint

  return (
    <Card className="py-5">
      <CardHeader className="px-5">
        <CardTitle className="flex items-center gap-2">
          邮件通知
          {!mailConfigured && <Badge variant="outline">未配置</Badge>}
        </CardTitle>
        <CardDescription>
          到期维护和即将过期的保修，发送至 {email}。
        </CardDescription>
      </CardHeader>
      <CardContent className="px-5">
        <div className="flex items-center gap-3">
          <Select value={value} onValueChange={change} disabled={pending}>
            <SelectTrigger className="w-64">
              {/* Base UI renders the raw value unless given a formatter, which
                  would show "WEEKLY" rather than "Weekly". */}
              <SelectValue>
                {(v: string) => OPTIONS.find((o) => o.value === v)?.label ?? v}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-sm text-muted-foreground">{hint}</span>
        </div>
        {!receivesNotifications && (
          <p className="mt-3 text-sm text-muted-foreground">
            管理员已为你的账户关闭了通知，因此无论在此选择什么，都不会向你发送邮件。
          </p>
        )}
        {!mailConfigured && (
          <p className="mt-3 text-sm text-muted-foreground">
            尚未配置邮件服务器，因此无论在此选择什么，都不会发送邮件。管理员可在下方<strong>邮件服务器</strong>中进行配置。
          </p>
        )}
      </CardContent>
    </Card>
  )
}
