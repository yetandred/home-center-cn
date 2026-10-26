"use client"

import { useEffect, useState, useTransition } from "react"
import { toast } from "sonner"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  clearExtractedText, deleteEmbeddingModel, downloadEmbeddingModel, getModelStatus, rebuildDocumentIndex, reextractDocuments,
  retryFailedDocuments, switchEmbeddingModel, updateDocumentSettings, type DocumentActionResult,
} from "@/lib/actions/document-settings"
// Types only: embed/server reaches Prisma and must never be bundled for the browser.
import type { ModelRow, ModelStatus } from "@/lib/documents/embed/server"
import { modelRowState } from "@/lib/documents/embed/model-row"

type Values = { indexingEnabled: boolean; ocrEnabled: boolean; semanticEnabled: boolean }

export function DocumentSettings({
  initial,
  stats: initialStats,
  models: initialModels,
}: {
  initial: Values
  stats: string
  models: ModelStatus
}) {
  const [values, setValues] = useState(initial)
  const [stats, setStats] = useState(initialStats)
  const [pending, start] = useTransition()
  const [models, setModels] = useState(initialModels)

  const downloading = models.download?.modelId ?? null
  useEffect(() => {
    if (!downloading) return
    const t = setInterval(async () => {
      const next = await getModelStatus()
      setModels(next)
      if (!next.download && next.lastDownload?.error) toast.error(`${next.lastDownload.modelId}: ${next.lastDownload.error}`)
    }, 1000)
    return () => clearInterval(t)
  }, [downloading])


  function run(action: () => Promise<DocumentActionResult>, done: string) {
    start(async () => {
      const r = await action()
      if ("error" in r) {
        toast.error(r.error)
        return
      }
      setStats(r.stats)
      toast.success(done)
    })
  }

  function save(next: Values) {
    const previous = values
    setValues(next)
    start(async () => {
      const r = await updateDocumentSettings(next)
      if ("error" in r) {
        setValues(previous)
        toast.error(r.error)
        return
      }
      setStats(r.stats)
    })
  }

  const on = values.indexingEnabled

  const refreshModels = async () => setModels(await getModelStatus())

  function download(m: ModelRow) {
    start(async () => {
      const r = await downloadEmbeddingModel(m.id)
      if ("error" in r) toast.error(r.error)
      await refreshModels()
    })
  }

  function switchTo(m: ModelRow) {
    if (!confirm(`切换到 ${m.label}？所有文档将在后台重新处理，期间关键词搜索仍可正常使用。`)) return
    run(() => switchEmbeddingModel(m.id), `正在切换到 ${m.label}。`)
    void refreshModels()
  }

  function remove(m: ModelRow) {
    if (!confirm(`删除 ${m.label}（${m.sizeMb} MB）？之后可以重新下载。`)) return
    start(async () => {
      const r = await deleteEmbeddingModel(m.id)
      if ("error" in r) toast.error(r.error)
      else toast.success(`已删除 ${m.label}。`)
      await refreshModels()
    })
  }

  return (
    <Card className="py-5">
      <CardHeader className="px-5">
        <CardTitle className="flex items-center gap-2">
          文档
          {on ? <Badge variant="secondary">开启</Badge> : <Badge variant="outline">关闭</Badge>}
        </CardTitle>
        <CardDescription>
          读取上传文件的文本内容，供 AI 助手搜索使用。所有数据都保留在本服务器上。
        </CardDescription>
      </CardHeader>
      <CardContent className="px-5 space-y-4">
        <label className="flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            className="h-4 w-4 accent-primary"
            checked={on}
            disabled={pending}
            onChange={(e) => save({ ...values, indexingEnabled: e.target.checked })}
          />
          为上传的文档建立索引
        </label>

        <div className="space-y-1">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4 accent-primary"
              checked={values.ocrEnabled}
              disabled={pending || !on}
              onChange={(e) => save({ ...values, ocrEnabled: e.target.checked })}
            />
            读取照片和扫描版 PDF 中的文字（OCR）
          </label>
          <p className="ml-6 text-xs text-muted-foreground">为新上传的文件建立索引时会占用较多 CPU。</p>
        </div>

        <div className="space-y-3 border-t pt-4">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              className="h-4 w-4 accent-primary"
              checked={values.semanticEnabled}
              disabled={pending || !on}
              onChange={(e) => save({ ...values, semanticEnabled: e.target.checked })}
            />
            按语义查找文档，而不只是精确匹配字词
          </label>
          <p className="ml-6 text-xs text-muted-foreground">
            在本服务器上运行一个小型 AI 模型，数据不会离开服务器。模型按需加载，空闲时自动卸载。
          </p>
          <div className="divide-y rounded-md border text-sm">
            {models.models.map((m) => {
              const isDownloading = models.download?.modelId === m.id
              const state = modelRowState(m, isDownloading)
              const pct = isDownloading && models.download ? Math.floor((models.download.received / models.download.total) * 100) : 0
              return (
                <div key={m.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                  <div className="min-w-0">
                    <div className="font-medium">
                      {m.label} <span className="font-normal text-muted-foreground">· {m.sizeMb} MB</span>
                    </div>
                    <div className="text-xs text-muted-foreground">{m.purpose}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    {m.active && state !== "downloading" && <Badge variant="secondary">使用中</Badge>}
                    {state === "downloading" ? (
                      <span className="text-xs text-muted-foreground">下载中… {pct}%</span>
                    ) : state === "in-use-missing" ? (
                      <>
                        <span className="text-xs text-destructive">文件缺失 — 仅支持关键词搜索</span>
                        <Button type="button" variant="outline" size="sm" disabled={pending || Boolean(models.download)} onClick={() => download(m)}>
                        重新下载
                      </Button>
                      </>
                    ) : state === "builtin-missing" ? (
                      <span className="text-xs text-destructive">
                        文件缺失{process.env.NODE_ENV === "development" ? " — 请运行 npm run models:fetch-builtin" : ""}
                      </span>
                    ) : state === "installed" ? (
                      <>
                        <Button type="button" variant="outline" size="sm" disabled={pending || !on} onClick={() => switchTo(m)}>
                          使用
                        </Button>
                        {!m.builtIn && (
                          <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => remove(m)}>
                            删除
                          </Button>
                        )}
                      </>
                    ) : state === "available" ? (
                      <Button type="button" variant="outline" size="sm" disabled={pending || Boolean(models.download)} onClick={() => download(m)}>
                        下载
                      </Button>
                    ) : null}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <p className="text-sm text-muted-foreground">{stats}</p>

        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" disabled={pending || !on} onClick={() => run(retryFailedDocuments, "正在重试失败的文件。")}>
            重试失败项
          </Button>
          <Button type="button" variant="outline" size="sm" disabled={pending || !on} onClick={() => run(rebuildDocumentIndex, "正在重建搜索索引。")}>
            重建索引
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pending || !on}
            onClick={() => {
              if (confirm("要重新读取所有已上传的文件吗？可能需要较长时间并占用 CPU。")) run(reextractDocuments, "正在重新读取所有文件。")
            }}
          >
            全部重新提取
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pending || on}
            onClick={() => {
              if (confirm("要删除所有已提取的文本和搜索索引吗？文件本身会保留。")) run(clearExtractedText, "已清除提取的文本。")
            }}
          >
            清除提取文本
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
