"use client"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useFormat } from "@/components/regional-provider"
import { formatSeconds, shortJson } from "./summary"
import type { HistoryEntry } from "./types"
import type { StageInfo } from "./use-model-test"

export function RunHistory({
  history,
  stages,
  onUseSettings,
  onClear,
}: {
  history: HistoryEntry[]
  stages: StageInfo[]
  onUseSettings: (entry: HistoryEntry) => void
  onClear: () => void
}) {
  const fmt = useFormat()
  return (
    <Card className="py-5">
      <CardHeader className="px-5">
        <CardTitle>历史</CardTitle>
        <CardDescription>最近 {history.length ? "" : "10 "}次运行记录，仅保存在本浏览器中。</CardDescription>
      </CardHeader>
      <CardContent className="px-5">
        {!history.length ? (
          <p className="text-sm text-muted-foreground">暂无运行记录 — 运行完成后结果会显示在这里。</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>时间</TableHead>
                    <TableHead>模型</TableHead>
                    <TableHead>温度</TableHead>
                    <TableHead>轮数</TableHead>
                    <TableHead>额外 JSON</TableHead>
                    <TableHead>得分</TableHead>
                    <TableHead>平均</TableHead>
                    <TableHead>分阶段</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {history.map((entry, i) => (
                    <TableRow key={`${entry.at}-${i}`}>
                      <TableCell className="text-xs text-muted-foreground">{fmt.dateTime(entry.at)}</TableCell>
                      <TableCell className="max-w-40 truncate font-medium" title={entry.model}>
                        {entry.model}
                        {entry.topics && (
                          <span className="block text-xs font-normal text-muted-foreground">仅：{entry.topics.join("、")}</span>
                        )}
                      </TableCell>
                      <TableCell>{entry.temperature || "默认"}</TableCell>
                      <TableCell>{entry.rounds ?? "—"}</TableCell>
                      <TableCell className="max-w-48 truncate font-mono text-xs" title={entry.extraBody || undefined}>
                        {shortJson(entry.extraBody, 40)}
                      </TableCell>
                      <TableCell>
                        <span className="font-medium">{entry.scorePct}%</span>{" "}
                        <span className="text-xs text-muted-foreground">
                          ({entry.passed}/{entry.total})
                        </span>
                        {entry.stoppedEarly && (
                          <Badge variant="outline" className="ml-1.5 text-[0.65rem]">
                            提前停止
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{formatSeconds(entry.avgMs)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {entry.perStage
                          .filter((s) => s.total > 0)
                          .map((s) => `${stages.find((st) => st.id === s.stage)?.label ?? s.stage} ${s.passed}/${s.total}`)
                          .join(" · ")}
                      </TableCell>
                      <TableCell>
                        <Button type="button" size="sm" variant="ghost" onClick={() => onUseSettings(entry)}>
                          使用此配置
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <Button type="button" size="sm" variant="outline" className="mt-3" onClick={onClear}>
              清空历史
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  )
}
