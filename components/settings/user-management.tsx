"use client"

import { useState } from "react"
import { signOut } from "next-auth/react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form"
import { Badge } from "@/components/ui/badge"
import { createUser, updateUserRole, resetUserPassword, deleteUser, updateSelf, changeOwnPassword } from "@/lib/actions/users"
import { MIN_PASSWORD_LENGTH } from "@/lib/password-change"
import type { User } from "@/app/generated/prisma/client"

const roleLabel: Record<string, string> = { ADMIN: "管理员", USER: "成员" }

export function UserManagement({ users, currentUserId }: { users: User[]; currentUserId: string }) {
  const [createOpen, setCreateOpen] = useState(false)
  const [editingSelf, setEditingSelf] = useState<User | null>(null)
  const [changingPassword, setChangingPassword] = useState(false)
  const [tempPassword, setTempPassword] = useState<{ name: string; password: string } | null>(null)

  async function handleRoleChange(id: string, role: string) {
    const result = await updateUserRole(id, role)
    if (result?.error) toast.error(typeof result.error === "string" ? result.error : "更新角色失败。")
    else toast.success("角色已更新。")
  }

  async function handleResetPassword(id: string, name: string) {
    if (!confirm(`重置 ${name} 的密码？下次登录时需要设置新密码。`)) return
    const result = await resetUserPassword(id)
    if (result?.error) { toast.error(result.error); return }
    setTempPassword({ name, password: result.tempPassword! })
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`删除用户“${name}”？此操作无法撤销。`)) return
    const result = await deleteUser(id)
    if (result?.error) toast.error(result.error)
    else toast.success(`已删除“${name}”。`)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">成员</h2>
        <Button onClick={() => setCreateOpen(true)}>添加成员</Button>
      </div>

      <div className="rounded-lg border overflow-hidden bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-muted-foreground">
            <tr>
              <th className="text-left font-medium px-4 py-2.5">姓名</th>
              <th className="text-left font-medium px-4 py-2.5 hidden sm:table-cell">邮箱</th>
              <th className="text-left font-medium px-4 py-2.5">角色</th>
              <th className="text-right font-medium px-4 py-2.5">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {users.map((u) => (
              <tr key={u.id} className="hover:bg-muted/20">
                <td className="px-4 py-3 font-medium">
                  {u.name}
                  {u.id === currentUserId && <Badge variant="outline" className="ml-2 text-xs">你</Badge>}
                  {u.mustResetPassword && <Badge variant="secondary" className="ml-2 text-xs">需重置密码</Badge>}
                </td>
                <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">{u.email}</td>
                <td className="px-4 py-3">
                  {u.id === currentUserId ? (
                    <Badge variant="secondary">{roleLabel[u.role]}</Badge>
                  ) : (
                    <Select value={u.role} onValueChange={(v) => handleRoleChange(u.id, v ?? u.role)}>
                      <SelectTrigger className="h-7 w-28 text-xs">
                        <SelectValue>{(v: keyof typeof roleLabel) => roleLabel[v]}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ADMIN">管理员</SelectItem>
                        <SelectItem value="USER">成员</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-2">
                    {u.id === currentUserId ? (
                      <>
                        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setChangingPassword(true)}>修改密码</Button>
                        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setEditingSelf(u)}>编辑</Button>
                      </>
                    ) : (
                      <>
                        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => handleResetPassword(u.id, u.name)}>重置密码</Button>
                        <Button variant="ghost" size="sm" className="h-7 text-xs text-destructive hover:text-destructive" onClick={() => handleDelete(u.id, u.name)}>删除</Button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <CreateUserDialog
        open={createOpen}
        onClose={(result) => {
          setCreateOpen(false)
          if (result) setTempPassword(result)
        }}
      />

      {editingSelf && (
        <EditSelfDialog
          user={editingSelf}
          onClose={() => setEditingSelf(null)}
        />
      )}

      {changingPassword && <ChangePasswordDialog onClose={() => setChangingPassword(false)} />}

      {tempPassword && (
        <Dialog open onOpenChange={() => setTempPassword(null)}>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>临时密码</DialogTitle></DialogHeader>
            <div className="space-y-3 text-sm">
              <p>请将此临时密码告知 <strong>{tempPassword.name}</strong>。首次登录时需要设置新密码。</p>
              <div className="rounded-md bg-muted px-4 py-3 font-mono text-lg tracking-widest text-center select-all">
                {tempPassword.password}
              </div>
            </div>
            <DialogFooter>
              <Button onClick={() => setTempPassword(null)}>完成</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}

const createSchema = z.object({
  name: z.string().min(1, "请输入姓名"),
  email: z.string().min(1, "请输入邮箱"),
  role: z.enum(["ADMIN", "USER"]),
})

function CreateUserDialog({ open, onClose }: { open: boolean; onClose: (result?: { name: string; password: string }) => void }) {
  const form = useForm({ resolver: zodResolver(createSchema), defaultValues: { name: "", email: "", role: "USER" as const } })

  async function onSubmit(values: z.infer<typeof createSchema>) {
    const result = await createUser(values)
    if (result?.error) {
      const emailError = Array.isArray(result.error.email) ? result.error.email[0] : null
      if (emailError) form.setError("email", { message: emailError })
      toast.error("创建成员失败。")
      return
    }
    toast.success(`成员已创建。`)
    form.reset()
    onClose({ name: values.name, password: result.tempPassword! })
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>添加成员</DialogTitle></DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField control={form.control} name="name" render={({ field }) => (
              <FormItem><FormLabel>姓名 *</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name="email" render={({ field }) => (
              <FormItem><FormLabel>邮箱 *</FormLabel><FormControl><Input type="email" {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name="role" render={({ field }) => (
              <FormItem>
                <FormLabel>角色 *</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl><SelectTrigger><SelectValue>{(v: keyof typeof roleLabel) => roleLabel[v]}</SelectValue></SelectTrigger></FormControl>
                  <SelectContent>
                    <SelectItem value="ADMIN">管理员 — 完全权限，可管理成员</SelectItem>
                    <SelectItem value="USER">成员 — 创建和编辑记录</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )} />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onClose()}>取消</Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? "创建中…" : "创建成员"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}

const editSelfSchema = z.object({
  name: z.string().min(1, "请输入姓名"),
  email: z.string().min(1, "请输入邮箱"),
})

function EditSelfDialog({ user, onClose }: { user: User; onClose: () => void }) {
  const form = useForm({
    resolver: zodResolver(editSelfSchema),
    defaultValues: { name: user.name, email: user.email },
  })

  async function onSubmit(values: z.infer<typeof editSelfSchema>) {
    const result = await updateSelf(values)
    if (result?.error) {
      const emailError = Array.isArray(result.error.email) ? result.error.email[0] : null
      if (emailError) form.setError("email", { message: emailError })
      toast.error("更新个人资料失败。")
      return
    }
    toast.success("个人资料已更新。")
    onClose()
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>编辑个人资料</DialogTitle></DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField control={form.control} name="name" render={({ field }) => (
              <FormItem><FormLabel>姓名 *</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name="email" render={({ field }) => (
              <FormItem><FormLabel>邮箱 *</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>取消</Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? "保存中…" : "保存更改"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}

const changePasswordSchema = z
  .object({
    current: z.string().min(1, "请输入当前密码"),
    next: z.string().min(MIN_PASSWORD_LENGTH, `至少 ${MIN_PASSWORD_LENGTH} 个字符`),
    confirm: z.string().min(1, "请确认新密码"),
  })
  .refine((v) => v.next === v.confirm, { path: ["confirm"], message: "两次输入的密码不一致" })

function ChangePasswordDialog({ onClose }: { onClose: () => void }) {
  const form = useForm({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { current: "", next: "", confirm: "" },
  })

  async function onSubmit(values: z.infer<typeof changePasswordSchema>) {
    const result = await changeOwnPassword(values)
    if ("error" in result && result.error) {
      form.setError(result.field, { message: result.error })
      return
    }
    // Every session for this account has just ended, this one included.
    await signOut({ callbackUrl: "/login?message=password-changed" })
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>修改密码</DialogTitle></DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField control={form.control} name="current" render={({ field }) => (
              <FormItem><FormLabel>当前密码</FormLabel><FormControl><Input type="password" autoComplete="current-password" {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name="next" render={({ field }) => (
              <FormItem><FormLabel>新密码</FormLabel><FormControl><Input type="password" autoComplete="new-password" {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name="confirm" render={({ field }) => (
              <FormItem><FormLabel>确认新密码</FormLabel><FormControl><Input type="password" autoComplete="new-password" {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <p className="text-xs text-muted-foreground">
              修改后，所有设备（包括当前设备）都会退出登录。
            </p>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>取消</Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? "修改中…" : "修改密码"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
