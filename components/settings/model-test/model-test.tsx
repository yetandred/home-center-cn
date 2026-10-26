"use client"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { formatSeconds } from "./summary"
import { EXTRA_PRESETS, type ModelTestCatalogEntry } from "./types"
import { ResultsList } from "./results-list"
import { RunHistory } from "./run-history"
import { useModelTest, type StageInfo } from "./use-model-test"

const REPEAT_OPTIONS = [1, 2, 3, 5]

export function ModelTest({
  savedModel,
  savedTemperature,
  savedExtraBody,
  savedRounds,
  defaultRounds,
  serverHost,
  timeoutSeconds,
  catalog,
  stages,
  today,
}: {
  savedModel: string
  savedTemperature: string
  savedExtraBody: string
  savedRounds: string
  defaultRounds: number
  serverHost: string
  timeoutSeconds: number
  catalog: ModelTestCatalogEntry[]
  stages: StageInfo[]
  today: string
}) {
  const t = useModelTest({ savedModel, savedTemperature, savedExtraBody, savedRounds, catalog, stages })

  const started = t.liveSummary.total > 0 || t.startLine !== null
  const progressPct = t.liveSummary.total ? Math.round((t.liveSummary.completed / t.liveSummary.total) * 100) : 0

  return (
    <div className="space-y-6">
      <Card className="py-5">
        <CardHeader className="px-5">
          <CardTitle>测试配置</CardTitle>
          <CardDescription>
            服务器：<span className="font-medium text-foreground">{serverHost}</span>（来自设置）。此处的更改仅用于本次测试，不会被保存。测试用例假定今天是 {today}；单次测试最长可能需要{" "}
            {timeoutSeconds} 秒。
          </CardDescription>
        </CardHeader>
        <CardContent className="px-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="mt-model">模型</Label>
              <Input
                id="mt-model"
                value={t.model}
                onChange={(e) => t.setModel(e.target.value)}
                placeholder={savedModel || "已保存的模型"}
                disabled={t.running}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mt-temp">温度</Label>
              <Input
                id="mt-temp"
                type="number"
                step="0.1"
                min={0}
                max={2}
                value={t.temperature}
                onChange={(e) => t.setTemperature(e.target.value)}
                placeholder="服务商默认值"
                disabled={t.running}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mt-rounds">查询轮数</Label>
              <Input
                id="mt-rounds"
                type="number"
                min={3}
                max={12}
                value={t.rounds}
                onChange={(e) => t.setRounds(e.target.value)}
                placeholder={`默认（${defaultRounds}）`}
                disabled={t.running}
              />
              <p className="text-xs text-muted-foreground">供“完整对话”类测试使用。</p>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="mt-extra">额外请求 JSON</Label>
              <Textarea
                id="mt-extra"
                rows={3}
                className="font-mono text-xs"
                value={t.extraBody}
                onChange={(e) => t.setExtraBody(e.target.value)}
                placeholder='{"chat_template_kwargs": {"enable_thinking": true}}'
                disabled={t.running}
              />
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                <span className="text-muted-foreground">预设：</span>
                {EXTRA_PRESETS.map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    className="underline hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
                    disabled={t.running}
                    onClick={() => t.applyPreset(p.value)}
                  >
                    {p.label}
                  </button>
                ))}
                <span className="text-muted-foreground">·</span>
                <button
                  type="button"
                  className="underline hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
                  disabled={t.running}
                  onClick={t.resetToSaved}
                >
                  恢复为已保存配置
                </button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="py-5">
        <CardHeader className="px-5">
          <CardTitle>测试范围</CardTitle>
          <CardDescription>
            默认运行全部测试。取消勾选某个阶段或选择特定主题可只运行所选内容。可重复运行以检验回答的一致性。
          </CardDescription>
        </CardHeader>
        <CardContent className="px-5 space-y-4">
          <div className="grid gap-2 sm:grid-cols-3">
            {stages.map((stage) => {
              const count = catalog.filter((c) => c.stage === stage.id && t.inTopics(c)).length
              return (
                <label
                  key={stage.id}
                  className="flex items-start gap-2 rounded-lg border border-border/60 p-3 text-sm has-[:disabled]:opacity-60"
                >
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 accent-primary"
                    checked={t.selectedStages.has(stage.id)}
                    onChange={() => t.toggleStage(stage.id)}
                    disabled={t.running}
                  />
                  <span>
                    <span className="block font-medium">
                      {stage.label} <span className="font-normal text-muted-foreground">({count})</span>
                    </span>
                    <span className="block text-xs text-muted-foreground">{stage.description}</span>
                  </span>
                </label>
              )
            })}
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium" id="mt-topics-label">主题</p>
            <div className="flex flex-wrap gap-1.5" role="group" aria-labelledby="mt-topics-label">
              <TopicChip
                label="全部主题"
                count={catalog.filter((c) => t.selectedStages.has(c.stage)).length}
                pressed={t.selectedTopics.size === 0}
                disabled={t.running}
                onClick={t.clearTopics}
              />
              {t.topics.map((topic) => (
                <TopicChip
                  key={topic}
                  label={topic}
                  count={catalog.filter((c) => c.category === topic && t.selectedStages.has(c.stage)).length}
                  pressed={t.selectedTopics.has(topic)}
                  disabled={t.running}
                  onClick={() => t.toggleTopic(topic)}
                />
              ))}
            </div>
            <p className="text-xs text-muted-foreground">选择一个或多个主题以只运行这些测试；选择“全部主题”可恢复运行所有内容。</p>
          </div>

          <div className="flex items-center gap-3">
            <Label htmlFor="mt-repeat" className="text-sm">
              重复次数
            </Label>
            <Select value={String(t.repeat)} onValueChange={(v) => v && t.setRepeat(Number(v))} disabled={t.running}>
              <SelectTrigger id="mt-repeat" size="sm" className="w-16">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REPEAT_OPTIONS.map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-xs text-muted-foreground">每个测试运行相应次数以检验一致性。</span>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        {t.running ? (
          <Button type="button" size="lg" variant="destructive" onClick={t.stop}>
            停止
          </Button>
        ) : (
          <Button type="button" size="lg" onClick={() => t.run()} disabled={!t.selectedCatalog.length}>
            {t.selectedCatalog.length === catalog.length ? "运行全部测试" : `运行 ${t.selectedCatalog.length} 项测试`}
          </Button>
        )}
        {t.canRerunFailed && (
          <Button type="button" variant="outline" onClick={t.rerunFailed}>
            重跑失败项
          </Button>
        )}
      </div>

      {t.error && (
        <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">{t.error}</p>
      )}

      {started && (
        <Card className="py-5">
          <CardContent className="space-y-3 px-5">
            {t.startLine && <p className="text-sm text-muted-foreground">{t.startLine}</p>}
            {t.warmup && (
              <p className="text-sm">
                {t.warmup.status === "pending" && <span className="text-muted-foreground">正在唤醒模型…</span>}
                {t.warmup.status === "ok" && (
                  <span className="text-muted-foreground">模型已就绪，耗时 {formatSeconds(t.warmup.ms)}。</span>
                )}
                {t.warmup.status === "warn" && (
                  <span className="text-amber-600 dark:text-amber-400">
                    模型未响应唤醒检查{t.warmup.error ? `：${t.warmup.error}` : "。"}
                  </span>
                )}
              </p>
            )}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-sm">
                <span>
                  {t.liveSummary.completed} / {t.liveSummary.total}
                </span>
                <span className="text-muted-foreground">{progressPct}%</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${progressPct}%` }} />
              </div>
            </div>
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
              <span className="text-green-600 dark:text-green-400">✓ {t.liveSummary.passed} 项通过</span>
              <span className="text-destructive">✗ {t.liveSummary.failed} 项失败</span>
              <span className="text-muted-foreground">
                得分：{" "}
                {t.liveSummary.completed
                  ? `${Math.round((t.liveSummary.passed / t.liveSummary.completed) * 100)}%`
                  : "—"}
              </span>
              <span className="text-muted-foreground">已用时：{formatSeconds(t.liveSummary.elapsedMs)}</span>
              <span className="text-muted-foreground">平均每项：{formatSeconds(t.liveSummary.avgMs)}</span>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="py-5">
        <CardHeader className="px-5">
          <CardTitle>结果</CardTitle>
        </CardHeader>
        <CardContent className="px-5">
          <ResultsList catalog={t.selectedCatalog} stages={stages} repeat={t.repeat} results={t.results} />
        </CardContent>
      </Card>

      <RunHistory history={t.history} stages={stages} onUseSettings={t.useHistorySettings} onClear={t.clearHistory} />
    </div>
  )
}

function TopicChip(props: { label: string; count: number; pressed: boolean; disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={props.pressed}
      disabled={props.disabled}
      onClick={props.onClick}
      className={cn(
        "rounded-full border px-3 py-1 text-sm transition-colors disabled:opacity-60",
        props.pressed ? "border-primary bg-primary text-primary-foreground" : "border-border/60 hover:bg-muted"
      )}
    >
      {props.label} <span className={props.pressed ? "opacity-80" : "text-muted-foreground"}>({props.count})</span>
    </button>
  )
}
