import { AssetImage } from "@/components/asset-image"
import { assetLabel } from "@/lib/assets"
import { averagePerMonth, categoryLabel, costPerMeter, sum, UNCATEGORIZED } from "@/lib/costs"
import { scheduleDue, type MileageIndex } from "@/lib/maintenance-due"
import type { ReportData, ReportRoom, ReportSchedule, ReportService, ReportWarranty } from "@/lib/report-server"
import type { ServiceCategory } from "@/app/generated/prisma/client"
import { Empty, SectionTitle } from "./report-parts"
import { HealthSummary } from "./health-summary"
import { getFormat } from "@/lib/regional-server"
import type { Formatter } from "@/lib/regional"
import { DEFAULT_REPORT_OPTIONS, type ReportOptions } from "@/lib/report-options"
import { paintLabel } from "@/lib/rooms"

// The printable asset report. A document, not a screen: one column, real
// headings, tables where things line up, and no interactive affordance anywhere
// inside it — the only control lives outside the sheet and is hidden in print.

/** `options` only applies to a medical summary; other reports print everything. */
export async function AssetReport({ data, options = DEFAULT_REPORT_OPTIONS }: { data: ReportData; options?: ReportOptions }) {
  const fmt = await getFormat()
  const { asset, services, warranties, schedules, costRows, generatedAt } = data
  const isPerson = asset.type === "PERSON"

  const lifetime = sum(costRows)
  const perMeter = asset.meterUnit ? costPerMeter(costRows) : null
  const now = generatedAt
  const activeWarranties = warranties.filter(
    (w) => w.expirationDate != null && new Date(w.expirationDate) >= now
  ).length

  // Mileage index for the due calculations, built from the asset itself rather
  // than the whole fleet: a report is about one thing.
  const mileage: MileageIndex =
    asset.type === "VEHICLE" && asset.currentMeter != null
      ? new Map([[asset.id, { value: asset.currentMeter, unit: asset.meterUnit ?? "MILES" }]])
      : new Map()

  const first = services[0]?.date ?? null
  const last = services[services.length - 1]?.date ?? null

  return (
    <article className="report-doc report-sheet mx-auto w-full max-w-[8.5in] px-10 py-9 shadow-sm print:shadow-none">
      <Masthead
        title={asset.name}
        subtitle={asset.subtitle}
        kind={isPerson ? "健康摘要" : assetLabel[asset.type]}
        generatedAt={generatedAt}
        fmt={fmt}
        image={
          asset.imageFilename ? (
            <AssetImage
              assetType={asset.type}
              assetId={asset.id}
              imageFilename={asset.imageFilename}
              alt={asset.name}
              className="aspect-[4/3] w-full rounded-md border"
              // The border is part of the document's furniture, so it has to
              // survive the print pipeline like every other rule here.
              data-print-color=""
            />
          ) : null
        }
      >
        <SectionTitle>{isPerson ? "个人信息" : "资产详情"}</SectionTitle>
        <dl className="mt-3">
          {asset.details.map((row) => (
            <div
              key={row.label}
              className="flex gap-4 border-b py-[5px] text-[10pt] last:border-b-0"
              style={{ borderColor: "var(--rule)" }}
            >
              <dt className="w-36 shrink-0" style={{ color: "var(--ink-soft)" }}>
                {row.label}
              </dt>
              <dd className="min-w-0 flex-1 font-medium">{row.value}</dd>
            </div>
          ))}
        </dl>
      </Masthead>
      {data.health && <HealthSummary health={data.health} now={now} options={options} fmt={fmt} />}
      {data.rooms.length > 0 && <Rooms rooms={data.rooms} fmt={fmt} />}

      {(!isPerson || options.expense) && (
      <section className="report-section mt-7">
        <SectionTitle>汇总</SectionTitle>
        <div
          className="mt-3 grid grid-cols-4 gap-px overflow-hidden rounded-md border"
          style={{ borderColor: "var(--rule-strong)", background: "var(--rule)" }}
          data-print-color=""
        >
          <Stat label={isPerson ? "累计医疗支出" : "累计维护费用"} value={fmt.money(lifetime)} />
          <Stat
            label={isPerson ? "就诊次数" : "维护记录"}
            value={String(services.length)}
            note={
              first && last
                ? `${new Date(first).getFullYear()}–${new Date(last).getFullYear()}`
                : undefined
            }
          />
          {isPerson ? (
            <Stat
              label="当前病症"
              value={String(data.health?.person.conditions.filter((c) => c.status !== "RESOLVED").length ?? 0)}
            />
          ) : (
            <Stat
              label="保修"
              value={`${activeWarranties} 项有效`}
              note={warranties.length > activeWarranties ? `共 ${warranties.length} 项` : undefined}
            />
          )}
          {perMeter != null ? (
            <Stat
              label={`每 ${fmt.meterWord(asset.meterUnit!)} 成本`}
              value={fmt.money(perMeter)}
            />
          ) : asset.purchasePrice != null ? (
            <Stat
              label="持有总成本"
              value={fmt.money(asset.purchasePrice + lifetime)}
              note="购入 + 维护"
            />
          ) : (
            <Stat
              label="月均支出"
              value={fmt.money(averagePerMonth(costRows, now))}
              note="自首条记录起"
            />
          )}
        </div>
      </section>
      )}

      {asset.notes ? (
        <section className="report-section report-break-avoid mt-7">
          <SectionTitle>备注</SectionTitle>
          <p className="mt-2 whitespace-pre-wrap text-[10pt]" style={{ color: "var(--ink-soft)" }}>
            {asset.notes}
          </p>
        </section>
      ) : null}

      {(!isPerson || options.visits !== "off") && (
        <ServiceHistory services={services} asset={data.asset} total={lifetime} showCost={!isPerson || options.visits === "cost"} fmt={fmt} />
      )}
      {!isPerson && <Warranties warranties={warranties} now={now} fmt={fmt} />}
      {(!isPerson || options.reminders) && (
        <Maintenance schedules={schedules} mileage={mileage} asset={data.asset} now={now} fmt={fmt} />
      )}

      <footer
        className="mt-9 border-t pt-3 text-[8.5pt]"
        style={{ borderColor: "var(--rule-strong)", color: "var(--ink-faint)" }}
        data-print-color=""
      >
        <div className="flex justify-between gap-6">
          <span>
            {asset.name} · {isPerson ? "健康摘要" : `${assetLabel[asset.type]}报告`} · 生成于{" "}
            {`${fmt.date(generatedAt, { long: true })} ${fmt.time(generatedAt)}`}
          </span>
          <span>HomeCenter</span>
        </div>
        {!isPerson && (
          <p className="mt-1.5">
            {services.length} 条维护记录 ·{" "}
            {warranties.length} 项保修 ·{" "}
            {schedules.length} 项维护计划。{" "}
            附件仅列出文件名，未嵌入文档；可从资产页面下载。
          </p>
        )}
      </footer>
    </article>
  )
}

function Masthead({
  title,
  subtitle,
  kind,
  generatedAt,
  fmt,
  image,
  children,
}: {
  title: string
  subtitle: string | null
  kind: string
  generatedAt: Date
  fmt: Formatter
  image: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <header>
      <div
        className="flex items-baseline justify-between border-b pb-2 text-[8.5pt] font-semibold uppercase tracking-[0.14em]"
        style={{ borderColor: "var(--rule-strong)", color: "var(--ink-faint)" }}
        data-print-color=""
      >
        <span>HomeCenter · {kind}报告</span>
        <span>{fmt.date(generatedAt, { long: true })}</span>
      </div>
      {/* The photo sits beside the title, not below it, so it uses the room the
          masthead leaves free; the details run on underneath the title. */}
      <div className="report-section mt-5 grid grid-cols-[1.6fr_1fr] gap-7">
        <div>
          <h1 className="font-heading text-[26pt] font-semibold leading-none">{title}</h1>
          {subtitle ? (
            <p className="mt-2 text-[12pt]" style={{ color: "var(--ink-soft)" }}>
              {subtitle}
            </p>
          ) : null}
          <div className="mt-6">{children}</div>
        </div>
        <div>{image}</div>
      </div>
    </header>
  )
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="px-3 py-2.5" style={{ background: "var(--paper)" }} data-print-color="">
      <div className="text-[13pt] font-semibold leading-tight">{value}</div>
      <div className="mt-1 text-[8pt] uppercase tracking-wide" style={{ color: "var(--ink-faint)" }}>
        {label}
      </div>
      {note ? (
        <div className="mt-0.5 text-[8pt]" style={{ color: "var(--ink-faint)" }}>
          {note}
        </div>
      ) : null}
    </div>
  )
}

/// Category is shown as a coloured dot beside its name, never as colour alone —
/// the report has to survive a monochrome printer, and the name is what does the
/// work there.
function CategoryTag({ category }: { category: ServiceCategory | null }) {
  const key = category ?? UNCATEGORIZED
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[9pt]">
      <span
        aria-hidden="true"
        className="h-2 w-2 shrink-0 rounded-full"
        style={{ background: `var(--cat-${key})` }}
        data-print-color=""
      />
      {categoryLabel(key)}
    </span>
  )
}

function Files({ attachments }: { attachments: { id: string; originalName: string }[] }) {
  if (attachments.length === 0) return null
  return (
    <div className="mt-1 text-[8.5pt]" style={{ color: "var(--ink-faint)" }}>
      附件：{attachments.map((a) => a.originalName).join("、")}
    </div>
  )
}

function Rooms({ rooms, fmt }: { rooms: ReportRoom[]; fmt: Formatter }) {
  return (
    <section className="report-section mt-7">
      <SectionTitle>房间</SectionTitle>
      <ul className="mt-1">
        {rooms.map((r) => {
          const size = [r.area != null ? fmt.area(r.area) : null, r.dimensions].filter(Boolean).join(" · ")
          const flooring = [
            r.flooringType,
            r.flooringProduct,
            r.flooringInstalled ? `${fmt.date(r.flooringInstalled, { utc: true })} 铺设` : null,
          ]
            .filter(Boolean)
            .join(" · ")

          return (
            <li key={r.id} className="report-break-avoid border-t py-3" style={{ borderColor: "var(--rule)" }}>
              <div className="flex items-baseline justify-between gap-4">
                <span className="font-semibold">{r.name}</span>
                {r.level ? (
                  <span className="text-[9.5pt]" style={{ color: "var(--ink-soft)" }}>
                    {r.level}
                  </span>
                ) : null}
              </div>
              {size ? (
                <div className="mt-1 text-[9.5pt]" style={{ color: "var(--ink-soft)" }}>
                  面积：{size}
                </div>
              ) : null}
              {flooring ? (
                <div className="mt-0.5 text-[9.5pt]" style={{ color: "var(--ink-soft)" }}>
                  地面：{flooring}
                </div>
              ) : null}
              {r.paints.map((p) => (
                <div key={p.id} className="mt-0.5 text-[9.5pt]" style={{ color: "var(--ink-soft)" }}>
                  {paintLabel(p)}
                </div>
              ))}
              {r.notes ? (
                <p className="mt-1 whitespace-pre-wrap text-[9.5pt]" style={{ color: "var(--ink-soft)" }}>
                  {r.notes}
                </p>
              ) : null}
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function ServiceHistory({
  services,
  asset,
  total,
  showCost,
  fmt,
}: {
  services: ReportService[]
  asset: ReportData["asset"]
  total: number
  showCost: boolean
  fmt: Formatter
}) {
  const showMeter = asset.type === "VEHICLE" && services.some((s) => s.mileageAtService != null)
  const unit = fmt.meterShort(asset.meterUnit ?? "MILES")

  return (
    <section className="report-section mt-7">
      <SectionTitle>{asset.type === "PERSON" ? "就诊与支出" : "维护历史"}</SectionTitle>
      {services.length === 0 ? (
        <Empty>{asset.type === "PERSON" ? "暂无就诊记录。" : "该资产暂无维护记录。"}</Empty>
      ) : (
        <table className="mt-1 w-full border-collapse text-[10pt]">
          {/* Repeated at the top of every printed page by the browser, which is
              the one thing a table gives a long document that a list cannot. */}
          <thead>
            <tr
              className="text-[8pt] uppercase tracking-wide"
              style={{ color: "var(--ink-faint)" }}
            >
              <th className="w-[94px] py-2 pr-3 text-left font-semibold">日期</th>
              <th className="py-2 pr-3 text-left font-semibold">维护项目</th>
              <th className="w-[104px] py-2 pr-3 text-left font-semibold">分类</th>
              {showMeter ? (
                <th className="w-[84px] py-2 pr-3 text-right font-semibold">{unit}</th>
              ) : null}
              {showCost ? <th className="w-[84px] py-2 text-right font-semibold">费用</th> : null}
            </tr>
          </thead>
          {services.map((s) => (
            <tbody key={s.id} className="report-break-avoid">
              <tr className="border-t align-top" style={{ borderColor: "var(--rule)" }}>
                <td className="whitespace-nowrap py-2.5 pr-3 tabular-nums" style={{ color: "var(--ink-soft)" }}>
                  {fmt.date(s.date, { utc: true })}
                </td>
                <td className="py-2.5 pr-3">
                  <div className="font-semibold">{s.title}</div>
                  {s.vendor ? (
                    <div className="text-[9pt]" style={{ color: "var(--ink-soft)" }}>
                      {s.vendor}
                    </div>
                  ) : null}
                  {s.description ? (
                    <p className="mt-1 whitespace-pre-wrap text-[9.5pt]" style={{ color: "var(--ink-soft)" }}>
                      {s.description}
                    </p>
                  ) : null}
                  <Files attachments={s.attachments} />
                </td>
                <td className="py-2.5 pr-3">
                  <CategoryTag category={s.category} />
                </td>
                {showMeter ? (
                  <td className="py-2.5 pr-3 text-right tabular-nums" style={{ color: "var(--ink-soft)" }}>
                    {s.mileageAtService != null ? s.mileageAtService.toLocaleString() : "—"}
                  </td>
                ) : null}
                {showCost ? (
                  <td className="py-2.5 text-right font-medium tabular-nums">
                    {s.cost != null ? fmt.money(s.cost) : "—"}
                  </td>
                ) : null}
              </tr>
            </tbody>
          ))}
          {showCost ? (
            <tfoot>
              <tr className="border-t-2" style={{ borderColor: "var(--rule-strong)" }}>
                <td className="py-2.5 text-[9pt] font-semibold uppercase tracking-wide" colSpan={showMeter ? 4 : 3}>
                  合计
                </td>
                <td className="py-2.5 text-right font-semibold tabular-nums">{fmt.money(total)}</td>
              </tr>
            </tfoot>
          ) : null}
        </table>
      )}
    </section>
  )
}

function Warranties({ warranties, now, fmt }: { warranties: ReportWarranty[]; now: Date; fmt: Formatter }) {
  return (
    <section className="report-section mt-7">
      <SectionTitle>保修</SectionTitle>
      {warranties.length === 0 ? (
        <Empty>该资产暂无保修记录。</Empty>
      ) : (
        <ul className="mt-1">
          {warranties.map((w) => {
            const expires = w.expirationDate ? new Date(w.expirationDate) : null
            const active = expires != null && expires >= now
            const remaining = expires ? remainingLife(expires, now) : null
            const contact = [w.vendor, w.vendorPhone, w.vendorEmail].filter(Boolean).join(" · ")

            return (
              <li
                key={w.id}
                className="report-break-avoid border-t py-3"
                style={{ borderColor: "var(--rule)" }}
              >
                <div className="flex items-baseline justify-between gap-4">
                  <span className="font-semibold">{w.productName}</span>
                  <StatusTag
                    tone={active ? "good" : "spent"}
                    label={
                      expires == null
                        ? "未记录到期时间"
                        : active
                          ? `有效 · 剩余 ${remaining}`
                          : "已过期"
                    }
                  />
                </div>
                <div className="mt-1 flex flex-wrap gap-x-6 text-[9.5pt]" style={{ color: "var(--ink-soft)" }}>
                  <span>
                    购买于{" "}
                    {w.purchaseDate
                      ? fmt.date(w.purchaseDate, { utc: true })
                      : "—"}
                  </span>
                  <span>
                    到期于{" "}
                    {expires ? fmt.date(expires, { utc: true }) : "—"}
                  </span>
                </div>
                {contact ? (
                  <div className="mt-0.5 text-[9.5pt]" style={{ color: "var(--ink-soft)" }}>
                    {contact}
                  </div>
                ) : null}
                {w.notes ? (
                  <p className="mt-1 whitespace-pre-wrap text-[9.5pt]" style={{ color: "var(--ink-soft)" }}>
                    {w.notes}
                  </p>
                ) : null}
                <Files attachments={w.attachments} />
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

function Maintenance({
  schedules,
  mileage,
  asset,
  now,
  fmt,
}: {
  schedules: ReportSchedule[]
  mileage: MileageIndex
  asset: ReportData["asset"]
  now: Date
  fmt: Formatter
}) {
  const unit = fmt.meterShort(asset.meterUnit ?? "MILES")

  return (
    <section className="report-section mt-7">
      <SectionTitle>{asset.type === "PERSON" ? "健康提醒" : "维护计划"}</SectionTitle>
      {schedules.length === 0 ? (
        <Empty>{asset.type === "PERSON" ? "暂无健康提醒。" : "该资产暂无定期维护计划。"}</Empty>
      ) : (
        <ul className="mt-1">
          {schedules.map((m) => {
            const due = scheduleDue(
              {
                assetType: asset.type,
                assetId: asset.id,
                nextDueDate: m.nextDueDate,
                nextDueMileage: m.nextDueMileage,
                reminderDaysBefore: m.reminderDaysBefore,
                reminderMilesBefore: m.reminderMilesBefore,
              },
              mileage,
              now
            )
            const interval = [
              m.intervalDays ? `每 ${m.intervalDays} 天` : null,
              m.intervalMiles ? `每 ${m.intervalMiles.toLocaleString()} ${unit}` : null,
            ]
              .filter(Boolean)
              .join(" 或 ")

            return (
              <li
                key={m.id}
                className="report-break-avoid border-t py-3"
                style={{ borderColor: "var(--rule)" }}
              >
                <div className="flex items-baseline justify-between gap-4">
                  <span className="font-semibold">
                    {m.title}
                    {!m.isActive ? (
                      <span className="ml-2 text-[9pt] font-normal" style={{ color: "var(--ink-faint)" }}>
                        （已停用）
                      </span>
                    ) : null}
                  </span>
                  {m.isActive ? (
                    <StatusTag
                      tone={due.overdue ? "bad" : due.dueSoon ? "warn" : "good"}
                      label={dueWording(due, unit)}
                    />
                  ) : null}
                </div>
                {interval ? (
                  <div className="mt-1 text-[9.5pt]" style={{ color: "var(--ink-soft)" }}>
                    周期：{interval}
                  </div>
                ) : null}
                <div className="mt-0.5 flex flex-wrap gap-x-6 text-[9.5pt]" style={{ color: "var(--ink-soft)" }}>
                  <span>
                    上次完成{" "}
                    {m.lastCompletedDate
                      ? fmt.date(m.lastCompletedDate, { utc: true })
                      : "—"}
                    {m.lastCompletedMileage != null
                      ? ` · ${m.lastCompletedMileage.toLocaleString()} ${unit}`
                      : ""}
                  </span>
                  <span>
                    下次到期{" "}
                    {m.nextDueDate
                      ? fmt.date(m.nextDueDate, { utc: true })
                      : "—"}
                    {m.nextDueMileage != null ? ` / ${m.nextDueMileage.toLocaleString()} ${unit}` : ""}
                  </span>
                </div>
                {m.description ? (
                  <p className="mt-1 whitespace-pre-wrap text-[9.5pt]" style={{ color: "var(--ink-soft)" }}>
                    {m.description}
                  </p>
                ) : null}
                <Files attachments={m.attachments} />
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

/// Days are the right unit for a fortnight and the wrong one for a thirty-year
/// roof warranty: "9,315 days left" is a number nobody converts. The unit grows
/// with the span so the figure stays one a reader can picture.
function remainingLife(expires: Date, now: Date): string {
  const days = Math.ceil((expires.getTime() - now.getTime()) / 86400000)
  if (days < 60) return `${days} 天`
  const months = Math.round(days / 30.44)
  if (months < 24) return `${months} 个月`
  const years = Math.floor(days / 365.25)
  const leftoverMonths = Math.round((days - years * 365.25) / 30.44)
  return leftoverMonths >= 1 ? `${years} 年 ${leftoverMonths} 个月` : `${years} 年`
}

function dueWording(due: ReturnType<typeof scheduleDue>, unit: string): string {
  if (due.overdue) {
    if (due.reason === "mileage" && due.milesLeft != null) {
      return `已逾期 ${Math.abs(due.milesLeft).toLocaleString()} ${unit}`
    }
    return due.daysLeft != null ? `已逾期 ${Math.abs(due.daysLeft)} 天` : "已逾期"
  }
  if (due.dueSoon) {
    if (due.reason === "mileage" && due.milesLeft != null) {
      return `还剩 ${due.milesLeft.toLocaleString()} ${unit}`
    }
    return due.daysLeft != null ? `还剩 ${due.daysLeft} 天` : "即将到期"
  }
  if (due.daysLeft != null) return `还剩 ${due.daysLeft} 天`
  if (due.milesLeft != null) return `还剩 ${due.milesLeft.toLocaleString()} ${unit}`
  return "已安排"
}

/// Status is a word first and a colour second, so the report still says what it
/// means printed in black and white.
function StatusTag({ tone, label }: { tone: "good" | "warn" | "bad" | "spent"; label: string }) {
  const color =
    tone === "bad" ? "#b3261e" : tone === "warn" ? "#8a5a00" : tone === "good" ? "#1a6b45" : "#6b7280"
  return (
    <span
      className="shrink-0 whitespace-nowrap rounded-full border px-2 py-[2px] text-[8.5pt] font-medium"
      style={{ color, borderColor: color }}
      data-print-color=""
    >
      {label}
    </span>
  )
}
