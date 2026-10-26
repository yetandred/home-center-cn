"use client"

import { useEffect, useState, useTransition } from "react"
import { useForm, useWatch } from "react-hook-form"
import Link from "next/link"
import { toast } from "sonner"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button, buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Form, FormField, FormItem, FormLabel, FormControl, FormDescription, FormMessage } from "@/components/ui/form"
import { Check } from "lucide-react"
import { settingsHref } from "@/lib/settings-sections"
import { testLlmConnection, updateLlmSettings, updateLlmSwitches, type LlmSwitches } from "@/lib/actions/llm-settings"
import { DEFAULT_TIMEOUT_SECONDS, DEFAULT_TOOL_ROUNDS, TOOL_ROUNDS_RANGE, LLM_PRESETS } from "@/lib/llm/settings-schema"

type Values = {
  enabled: boolean
  hidden: boolean
  baseUrl: string
  apiKey: string
  model: string
  temperature: string
  maxTokens: string
  systemPrompt: string
  timeoutSeconds: string
  maxToolRounds: string
  extraBody: string
  documentsEnabled: boolean
  healthDocumentsEnabled: boolean
}

export function LlmSettings({
  initial,
  hasStoredKey,
  keyUnreadable,
  ready,
  indexingEnabled,
  healthEnabled,
}: {
  initial: Omit<Values, "apiKey">
  hasStoredKey: boolean
  keyUnreadable: boolean
  ready: boolean
  /** Document switches only matter while indexing is on (Settings → Documents). */
  indexingEnabled: boolean
  /** Health on or off under Settings → Features. */
  healthEnabled: boolean
}) {
  const form = useForm<Values>({ defaultValues: { ...initial, apiKey: "" } })
  const [clearApiKey, setClearApiKey] = useState(false)
  const [testing, startTest] = useTransition()
  const [switchPending, startSwitch] = useTransition()
  const [switchStatus, setSwitchStatus] = useState<"idle" | "saved">("idle")
  const [enabled, hidden, documentsEnabled, healthDocumentsEnabled] = useWatch({
    control: form.control,
    name: ["enabled", "hidden", "documentsEnabled", "healthDocumentsEnabled"],
  })

  useEffect(() => {
    if (switchStatus !== "saved") return
    const t = setTimeout(() => setSwitchStatus("idle"), 2000)
    return () => clearTimeout(t)
  }, [switchStatus])

  /** Shows the change at once, saves it, and puts it back if the save is refused. */
  function toggle(patch: Partial<LlmSwitches>) {
    const keys = ["enabled", "hidden", "documentsEnabled", "healthDocumentsEnabled"] as const
    const previous = Object.fromEntries(keys.map((k) => [k, form.getValues(k)])) as LlmSwitches
    const apply = (v: Partial<LlmSwitches>) => {
      for (const k of keys) if (v[k] !== undefined) form.setValue(k, v[k]!, { shouldDirty: false })
    }
    apply({ ...patch, ...(patch.enabled ? { hidden: false } : {}) })
    setSwitchStatus("idle")
    startSwitch(async () => {
      const result = await updateLlmSwitches(patch)
      if ("error" in result) {
        apply(previous)
        toast.error(result.error)
        return
      }
      apply(result.values)
      setSwitchStatus("saved")
    })
  }

  async function onSubmit(values: Values) {
    const result = await updateLlmSettings({ ...values, clearApiKey })
    if ("error" in result) {
      toast.error(result.error)
      return
    }
    toast.success("AI 助手设置已保存。")
    form.setValue("apiKey", "")
    setClearApiKey(false)
  }

  function runTest() {
    startTest(async () => {
      const result = await testLlmConnection({ ...form.getValues(), clearApiKey })
      if ("error" in result) {
        toast.error(result.error, { duration: 15000 })
        return
      }
      if (result.toolCalling) toast.success(`已连接到 ${result.model} — 工具调用正常。`)
      else
        toast.warning(
          `已连接到 ${result.model}，但它未调用测试工具。可能不支持工具调用，而 AI 助手需要此功能。`,
          { duration: 15000 }
        )
    })
  }

  return (
    <Card className="py-5">
      <CardHeader className="px-5">
        <CardTitle className="flex items-center gap-2">
          AI 助手
          {ready ? <Badge variant="secondary">开启</Badge> : <Badge variant="outline">关闭</Badge>}
        </CardTitle>
        <CardDescription>
          让所有成员在聊天中询问 HomeCenter 数据相关的问题。兼容任何 OpenAI 兼容服务器 — OpenAI、Ollama、LM Studio、OpenRouter。问题和回答所需的记录会发送到该服务器，包括健康记录；如有顾虑请使用本地模型。
        </CardDescription>
      </CardHeader>
      <CardContent className="px-5">
        {keyUnreadable && (
          <p className="mb-4 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            已保存的 API 密钥无法解密 — 通常是 <code className="text-xs">AUTH_SECRET</code>{" "}
            发生了变化。请重新输入。
          </p>
        )}
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="rounded-lg border bg-muted/30 p-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">开关</p>
                <SaveStatus status={switchPending ? "saving" : switchStatus} />
              </div>
              <div className="space-y-3">
                <SwitchRow
                  label="开启 AI 助手"
                  checked={enabled}
                  disabled={switchPending}
                  onChange={(v) => toggle({ enabled: v })}
                />
                <SwitchRow
                  label="在导航菜单和右上角按钮中隐藏 AI 助手"
                  nested
                  checked={hidden}
                  disabled={switchPending || enabled}
                  disabledReason={enabled ? "仅在 AI 助手关闭时可用" : undefined}
                  onChange={(v) => toggle({ hidden: v })}
                />
                <SwitchRow
                  label="允许 AI 助手读取上传的文档"
                  checked={documentsEnabled}
                  disabled={switchPending || !indexingEnabled}
                  onChange={(v) => toggle({ documentsEnabled: v })}
                  hint={
                    indexingEnabled
                      ? "与问题相关时，文档文本会发送到所配置的 LLM 服务器。"
                      : "请先开启文档索引（设置 → 文档与搜索）。"
                  }
                />
                <SwitchRow
                  label="包含健康记录文档"
                  nested
                  checked={healthDocumentsEnabled && healthEnabled}
                  disabled={switchPending || !healthEnabled || !indexingEnabled || !documentsEnabled}
                  disabledReason={
                    !healthEnabled ? (
                      <>
                        健康功能已在{" "}
                        <Link href={settingsHref("features")} className="underline underline-offset-2 hover:text-foreground">
                          功能设置
                        </Link>
                        {" "}中关闭
                      </>
                    ) : indexingEnabled && !documentsEnabled ? (
                      "需要开启上方选项"
                    ) : undefined
                  }
                  onChange={(v) => toggle({ healthDocumentsEnabled: v })}
                  hint="包括成员相关的各类文件：就诊、提醒和保修，以及病症、观察记录、用药、过敏和疫苗接种。使用云服务商时，这些文本会离开本服务器。"
                />
              </div>
              <p className="mt-3 text-xs text-muted-foreground">更改后立即保存。</p>
            </div>

            <div className="border-t pt-5">
              <h3 className="font-heading text-base font-semibold">高级设置</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">
                AI 助手连接的服务器及其行为方式。此处的更改需点击保存按钮才会生效。
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="baseUrl" render={({ field }) => (
                <FormItem className="col-span-2">
                  <FormLabel>Base URL</FormLabel>
                  <FormControl><Input placeholder="https://api.openai.com/v1" {...field} /></FormControl>
                  <FormDescription className="text-xs">
                    快速填入：{" "}
                    {LLM_PRESETS.map((p, i) => (
                      <span key={p.id}>
                        {i > 0 && " · "}
                        <button
                          type="button"
                          className="underline hover:text-foreground"
                          onClick={() => form.setValue("baseUrl", p.baseUrl, { shouldDirty: true })}
                        >
                          {p.label}
                        </button>
                      </span>
                    ))}
                    。在 Docker 中请使用宿主机地址，而非 localhost。
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="model" render={({ field }) => (
                <FormItem>
                  <FormLabel>模型</FormLabel>
                  <FormControl><Input placeholder="gpt-4o-mini" {...field} /></FormControl>
                  <FormDescription className="text-xs">必须支持工具（函数）调用。</FormDescription>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="apiKey" render={({ field }) => (
                <FormItem>
                  <FormLabel>API 密钥</FormLabel>
                  <FormControl>
                    <Input
                      type="password"
                      autoComplete="new-password"
                      placeholder={hasStoredKey ? "••••••••（未更改）" : "本地服务器无需填写"}
                      disabled={clearApiKey}
                      {...field}
                    />
                  </FormControl>
                  <FormDescription className="text-xs">
                    加密存储，且只发送到保存时对应的服务器 — 更换 Base URL 后，已保存的密钥将被丢弃。
                    {hasStoredKey && (
                      <button type="button" className="ml-1 underline hover:text-foreground" onClick={() => setClearApiKey((c) => !c)}>
                        {clearApiKey ? "保留已保存的密钥" : "移除已保存的密钥"}
                      </button>
                    )}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="temperature" render={({ field }) => (
                <FormItem>
                  <FormLabel>温度</FormLabel>
                  <FormControl><Input type="number" step="0.1" min={0} max={2} placeholder="服务商默认值" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="maxTokens" render={({ field }) => (
                <FormItem>
                  <FormLabel>最大 Token 数</FormLabel>
                  <FormControl><Input type="number" min={1} max={32000} placeholder="服务商默认值" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="timeoutSeconds" render={({ field }) => (
                <FormItem>
                  <FormLabel>每个问题的时间限制（秒）</FormLabel>
                  <FormControl><Input type="number" min={30} max={900} placeholder={String(DEFAULT_TIMEOUT_SECONDS)} {...field} /></FormControl>
                  <FormDescription className="text-xs">
                    本地模型较慢时可调高。回复开始后，如果服务器连续 60 秒没有发送内容，同样会停止。
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="maxToolRounds" render={({ field }) => (
                <FormItem>
                  <FormLabel>每个问题的查询轮数</FormLabel>
                  <FormControl>
                    <Input type="number" min={TOOL_ROUNDS_RANGE.min} max={TOOL_ROUNDS_RANGE.max} placeholder={String(DEFAULT_TOOL_ROUNDS)} {...field} />
                  </FormControl>
                  <FormDescription className="text-xs">
                    AI 助手在必须作答前，最多可回头获取数据的次数。调高有助于处理追问和多步骤问题；简单问题无论如何都会提前结束。
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="systemPrompt" render={({ field }) => (
                <FormItem className="col-span-2">
                  <FormLabel>额外指令</FormLabel>
                  <FormControl><Textarea rows={3} maxLength={4000} placeholder="例如：回答尽量简短。" {...field} /></FormControl>
                  <FormDescription className="text-xs">附加到 AI 助手的内置指令之后。</FormDescription>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="extraBody" render={({ field }) => (
                <FormItem className="col-span-2">
                  <FormLabel>额外请求 JSON</FormLabel>
                  <FormControl>
                    <Textarea rows={3} maxLength={2000} className="font-mono text-xs" placeholder='{"chat_template_kwargs": {"enable_thinking": true}}' {...field} />
                  </FormControl>
                  <FormDescription className="text-xs">
                    每次请求都会附带的可选字段，用于服务器支持的设置 — 例如开启模型的思考模式（llama.cpp、vLLM）或 <code className="text-xs">reasoning_effort</code>（OpenAI）。不确定时请留空。
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            <div className="flex items-center gap-2">
              <Button type="submit" disabled={form.formState.isSubmitting || switchPending}>
                {form.formState.isSubmitting ? "保存中…" : "保存"}
              </Button>
              <Button type="button" variant="outline" disabled={testing} onClick={runTest}>
                {testing ? "测试中…" : "测试连接"}
              </Button>
              <Link href="/settings/assistant-test" className={buttonVariants({ variant: "ghost" })}>
                运行模型测试 →
              </Link>
            </div>
            <p className="text-xs text-muted-foreground">
              测试使用上方填写的配置，保存前即可试运行。
            </p>
          </form>
        </Form>
      </CardContent>
    </Card>
  )
}

function SwitchRow({
  label, checked, disabled, disabledReason, onChange, hint, nested,
}: {
  label: string
  checked: boolean
  disabled?: boolean
  onChange: (checked: boolean) => void
  hint?: string
  /** Why it can't be changed right now, shown beside the label. */
  disabledReason?: React.ReactNode
  /** Depends on the option above it: indented beneath it. */
  nested?: boolean
}) {
  return (
    <div className="space-y-1">
      <label className={`flex items-center gap-2 text-sm ${nested ? "ml-6 font-normal" : "font-medium"} ${disabled ? "opacity-60" : ""}`}>
        <input
          type="checkbox"
          className="h-4 w-4 accent-primary"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span>{label}</span>
      </label>
      {disabledReason && (
        <p className={`${nested ? "ml-12" : "ml-6"} text-xs font-medium text-muted-foreground`}>({disabledReason})</p>
      )}
      {hint && <p className={`${nested ? "ml-12" : "ml-6"} text-xs text-muted-foreground`}>{hint}</p>}
    </div>
  )
}

function SaveStatus({ status }: { status: "idle" | "saving" | "saved" }) {
  if (status === "idle") return null
  return (
    <span role="status" className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      {status === "saving" ? (
        "保存中…"
      ) : (
        <>
          <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" /> 已保存
        </>
      )}
    </span>
  )
}
