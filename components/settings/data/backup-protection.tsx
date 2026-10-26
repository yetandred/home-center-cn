"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { KeyRound, Lock, ShieldOff, Download } from "lucide-react"
import { generateX25519Identity, identityToRecipient } from "age-encryption"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { setProtectionKey, setProtectionNone, setProtectionPassword } from "@/lib/actions/backup"
import { fingerprintOf, passwordProblem } from "@/lib/backup/protect-shared"
import type { BackupOverview } from "@/lib/backup/overview-server"
import { recoveryKitText } from "./recovery-kit"

type Mode = "NONE" | "KEY" | "PASSWORD"
const OPTIONS: { mode: Mode; icon: React.ElementType; title: string; body: string }[] = [
  { mode: "NONE", icon: ShieldOff, title: "无保护", body: "普通 zip 文件，任何地方都能打开。拿到文件的人都可以读取内容。" },
  { mode: "KEY", icon: KeyRound, title: "恢复密钥", body: "由你保管密钥文件。服务器可以创建备份但无法打开。最安全。" },
  { mode: "PASSWORD", icon: Lock, title: "密码 zip", body: "凭密码可在 7-Zip、WinRAR 或 Keka 中打开。服务器会保存密码以便创建定时备份。" },
]

export function BackupProtection({ data, onSaved }: { data: BackupOverview; onSaved: () => Promise<void> }) {
  const current = data.settings.protection
  const [dialog, setDialog] = useState<Mode | null>(null)
  const [pending, start] = useTransition()

  function choose(mode: Mode) {
    if (mode === current && mode !== "KEY" && mode !== "PASSWORD") return
    if (mode === "NONE") {
      if (!window.confirm("确定关闭保护？新备份将可被任何拿到文件的人读取。已有的受保护备份仍保持保护状态。")) return
      start(async () => {
        const r = await setProtectionNone()
        if ("error" in r) toast.error(r.error)
        else toast.success("新备份已关闭保护。")
        await onSaved()
      })
      return
    }
    setDialog(mode)
  }

  return (
    <Card className="py-5">
      <CardHeader className="px-5">
        <CardTitle>保护</CardTitle>
        <CardDescription>仅对新备份生效。列表中每个备份都会显示其保护方式。</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 px-5 sm:grid-cols-3">
        {OPTIONS.map((o) => (
          <button
            key={o.mode}
            type="button"
            disabled={pending}
            onClick={() => choose(o.mode)}
            aria-pressed={current === o.mode}
            className={cn("rounded-lg border p-3 text-left transition-colors hover:bg-muted/50", current === o.mode && "border-primary ring-1 ring-primary")}
          >
            <span className="flex items-center gap-2 text-sm font-medium"><o.icon className="h-4 w-4" aria-hidden="true" />{o.title}</span>
            <span className="mt-1 block text-xs text-muted-foreground">{o.body}</span>
            {current === o.mode && o.mode === "KEY" && data.settings.keyFingerprint && (
              <span className="mt-2 block text-xs">密钥 {data.settings.keyFingerprint} · <span className="underline">生成新密钥</span></span>
            )}
            {current === o.mode && o.mode === "PASSWORD" && <span className="mt-2 block text-xs underline">更改密码</span>}
          </button>
        ))}
      </CardContent>
      {dialog === "KEY" && <KeyDialog onClose={() => setDialog(null)} onSaved={onSaved} replacing={current === "KEY"} />}
      {dialog === "PASSWORD" && <PasswordDialog onClose={() => setDialog(null)} onSaved={onSaved} />}
    </Card>
  )
}

function KeyDialog({ onClose, onSaved, replacing }: { onClose: () => void; onSaved: () => Promise<void>; replacing: boolean }) {
  const [kit, setKit] = useState<{ identity: string; recipient: string; fingerprint: string } | null>(null)
  const [downloaded, setDownloaded] = useState(false)
  const [saved, setSaved] = useState(false)
  const [pending, start] = useTransition()

  async function make() {
    // Generated here, in the browser: only the public half is ever sent.
    const identity = await generateX25519Identity()
    const recipient = await identityToRecipient(identity)
    setKit({ identity, recipient, fingerprint: await fingerprintOf(recipient) })
  }

  function download() {
    if (!kit) return
    const blob = new Blob([recoveryKitText({ ...kit, created: new Date() })], { type: "text/plain" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "homecenter-recovery-key.txt"
    // Some browsers only download from an anchor in the document, and start reading the blob after click() returns.
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
    setDownloaded(true)
  }

  function finish() {
    if (!kit) return
    start(async () => {
      const r = await setProtectionKey({ publicKey: kit.recipient, fingerprint: kit.fingerprint })
      if ("error" in r) return void toast.error(r.error)
      toast.success(`新备份将使用恢复密钥 ${kit.fingerprint}。`)
      setKit(null) // drop the private key from memory
      await onSaved()
      onClose()
    })
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{replacing ? "生成新的恢复密钥" : "设置恢复密钥"}</DialogTitle>
          <DialogDescription>
            HomeCenter 在此浏览器中生成密钥，只保留公钥部分。密钥本身需要你下载一次并妥善保管。
            {replacing ? " 旧的备份仍需旧的密钥文件才能打开。" : ""}
          </DialogDescription>
        </DialogHeader>
        {!kit ? (
          <Button onClick={() => void make()}>生成我的密钥</Button>
        ) : (
          <div className="space-y-3 text-sm">
            <p>指纹 <span className="font-mono">{kit.fingerprint}</span></p>
            <Button variant="outline" onClick={download}><Download className="h-4 w-4" aria-hidden="true" />下载恢复密钥</Button>
            <label className="flex items-start gap-2">
              <input type="checkbox" className="mt-0.5 h-4 w-4 accent-primary" checked={saved} disabled={!downloaded} onChange={(e) => setSaved(e.target.checked)} />
              <span>我已将密钥保存在本服务器以外的地方。我了解没有该密钥将无法打开用它创建的备份。</span>
            </label>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>取消</Button>
          <Button disabled={!kit || !saved || pending} onClick={finish}>使用此密钥</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function PasswordDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => Promise<void> }) {
  const [pw, setPw] = useState("")
  const [again, setAgain] = useState("")
  const [pending, start] = useTransition()
  const problem = pw ? passwordProblem(pw) : null
  const mismatch = again && pw !== again ? "两次输入的密码不一致。" : null

  function save(e: React.FormEvent) {
    e.preventDefault()
    start(async () => {
      const r = await setProtectionPassword({ password: pw })
      if ("error" in r) return void toast.error(r.error)
      toast.success("新备份将使用密码 zip。")
      await onSaved()
      onClose()
    })
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <form onSubmit={save} className="space-y-4">
          <DialogHeader>
            <DialogTitle>备份密码</DialogTitle>
            <DialogDescription>
              至少 6 个字符。HomeCenter 会加密保存该密码以创建定时备份，因此同时掌握你的数据目录和 AUTH_SECRET 的人可以打开这些备份。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="bk-pw">密码</Label>
            <Input id="bk-pw" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />
            {problem && <p className="text-xs text-destructive">{problem}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bk-pw2">再次输入密码</Label>
            <Input id="bk-pw2" type="password" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} />
            {mismatch && <p className="text-xs text-destructive">{mismatch}</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>取消</Button>
            <Button type="submit" disabled={pending || !pw || !!problem || pw !== again}>保存密码</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
