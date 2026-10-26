"use client"

import { useRouter, usePathname } from "next/navigation"
import { useTransition } from "react"
import {
  HISTORY_RANGES, MED_NOTES, OBS_RANGES, OBS_VIEWS, VISIT_MODES, reportOptionsQuery,
  type ReportOptions,
} from "@/lib/report-options"

// The medical summary's customisation, in a rail beside the sheet. Every change
// rewrites the query string and the server re-renders the document.

const BOOLEANS: { key: keyof ReportOptions; label: string }[] = [
  { key: "allergies", label: "过敏" },
  { key: "conditions", label: "病症" },
  { key: "medications", label: "用药" },
  { key: "immunizations", label: "疫苗接种" },
  { key: "insurance", label: "保险" },
  { key: "careTeam", label: "医护团队" },
  { key: "review", label: "用药与行为回顾" },
  { key: "changes", label: "用药调整观察" },
]

export function ReportOptionsPanel({ options }: { options: ReportOptions }) {
  const router = useRouter()
  const pathname = usePathname()
  const [pending, start] = useTransition()

  function set<K extends keyof ReportOptions>(key: K, value: ReportOptions[K]) {
    start(() => router.replace(`${pathname}?${reportOptionsQuery({ ...options, [key]: value })}`, { scroll: false }))
  }

  const check = (key: keyof ReportOptions, label: string) => (
    <label key={key} className="flex cursor-pointer items-center gap-2 py-1 text-sm">
      <input
        type="checkbox"
        className="h-3.5 w-3.5"
        checked={options[key] as boolean}
        onChange={(e) => set(key, e.target.checked as never)}
      />
      {label}
    </label>
  )

  const select = <T extends string>(
    key: keyof ReportOptions,
    label: string,
    choices: readonly { value: T; label: string }[]
  ) => (
    <label className="block py-1 text-sm">
      <span className="mb-1 block">{label}</span>
      <select
        className="w-full rounded-md border bg-background px-2 py-1 text-sm"
        value={options[key] as string}
        onChange={(e) => set(key, e.target.value as never)}
      >
        {choices.map((c) => (
          <option key={c.value} value={c.value}>{c.label}</option>
        ))}
      </select>
    </label>
  )

  return (
    <aside
      className={`no-print sticky top-4 w-60 shrink-0 self-start rounded-lg border bg-background p-4 ${pending ? "opacity-70" : ""}`}
      aria-label="报告内容"
    >
      <h2 className="mb-2 text-sm font-semibold">报告包含内容</h2>
      <div>
        {BOOLEANS.slice(0, 6).map((b) => check(b.key, b.label))}
        <hr className="my-2" />
        {BOOLEANS.slice(6, 7).map((b) => check(b.key, b.label))}
        {check("history", "用药历史图表")}
        {check("medList", "用药历史")}
        {options.medList && <div className="ml-2 border-l pl-3">{select("medListNotes", "包含备注", MED_NOTES)}</div>}
        {(options.history || options.medList) && (
          <div className="ml-2 border-l pl-3">{select("historyRange", "用药历史范围", HISTORY_RANGES)}</div>
        )}
        {BOOLEANS.slice(7).map((b) => check(b.key, b.label))}
        <hr className="my-2" />
        {select("obs", "观察记录", OBS_RANGES)}
        {options.obs !== "off" && (
          <div className="ml-2 border-l pl-3">
            {select("obsView", "图表", OBS_VIEWS)}
            {check("obsList", "记录列表")}
            {options.obsList && <div className="ml-2 border-l pl-3">{check("obsNotes", "包含备注")}</div>}
          </div>
        )}
        <hr className="my-2" />
        {check("expense", "医疗支出")}
        {select("visits", "就诊与支出", VISIT_MODES)}
        {check("reminders", "健康提醒")}
      </div>
    </aside>
  )
}
