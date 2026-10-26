"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { setReceivesNotifications } from "@/lib/actions/users"

export type Recipient = { id: string; name: string; email: string; role: string; receivesNotifications: boolean }

// Admin-only: which accounts get the bell and digest emails. Turning someone
// off stops new notifications; anything already in their list stays there.
export function NotificationRecipients({ users, currentUserId }: { users: Recipient[]; currentUserId: string }) {
  const [on, setOn] = useState(() => Object.fromEntries(users.map((u) => [u.id, u.receivesNotifications])))
  const [pending, start] = useTransition()
  const count = Object.values(on).filter(Boolean).length

  function toggle(user: Recipient, next: boolean) {
    setOn((prev) => ({ ...prev, [user.id]: next }))
    start(async () => {
      const r = await setReceivesNotifications(user.id, next)
      if (r?.error) {
        setOn((prev) => ({ ...prev, [user.id]: !next })) // put the box back if the server refused
        toast.error(r.error)
        return
      }
      toast.success(next ? `${user.name} 将接收通知。` : `${user.name} 将不再接收通知。`)
    })
  }

  return (
    <Card className="py-5">
      <CardHeader className="px-5">
        <CardTitle className="flex items-center gap-2">
          谁接收通知
          <Badge variant="outline">{count} / {users.length}</Badge>
        </CardTitle>
        <CardDescription>
          勾选的账户会在通知铃中收到提醒，若其选择开启还会通过邮件接收。未勾选的账户两者都不会收到。
        </CardDescription>
      </CardHeader>
      <CardContent className="px-5">
        <ul className="divide-y rounded-lg border">
          {users.map((u) => (
            <li key={u.id}>
              <label className="flex cursor-pointer items-center gap-3 px-3 py-2.5 text-sm">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-primary"
                  checked={on[u.id]}
                  disabled={pending}
                  onChange={(e) => toggle(u, e.target.checked)}
                />
                <span className="min-w-0 flex-1">
                  <span className="font-medium">{u.name}</span>
                  {u.id === currentUserId && <span className="text-muted-foreground">（你）</span>}
                  <span className="block truncate text-muted-foreground">{u.email}</span>
                </span>
                {u.role === "ADMIN" && <Badge variant="secondary">管理员</Badge>}
              </label>
            </li>
          ))}
        </ul>
        {count === 0 && (
          <p className="mt-3 text-sm text-muted-foreground">
            没有勾选任何账户，提醒将无法送达任何人。
          </p>
        )}
      </CardContent>
    </Card>
  )
}
