import { prisma } from "@/lib/prisma"
import { redirect } from "next/navigation"
import { Badge } from "@/components/ui/badge"
import { SearchBar } from "@/components/search-bar"
import Link from "next/link"
import { Wrench } from "lucide-react"
import { Suspense } from "react"
import { loadAssetIndex } from "@/lib/assets-server"
import { assetHref, assetIcon } from "@/lib/assets"
import { UrlSortHead, UrlPaginationBar } from "@/components/ui/url-table"
import { parseTableParams, pageCountOf, withParams, type SortMap } from "@/lib/table-params"
import type { AssetType, Prisma } from "@/app/generated/prisma/client"
import { ownedWhere } from "@/lib/features"
import { loadFeatures } from "@/lib/features-server"
import { RecordEditLink } from "@/components/service-records/record-edit-link"
import { RecordsAddButton } from "@/components/service-records/records-add-button"
import { emptyStateCopy } from "@/lib/intake-ui"
import { getFormat } from "@/lib/regional-server"

const DEFAULT_SORT = "date"
const DEFAULT_DIR = "desc"

const serviceTab = (assetType: AssetType) => (assetType === "PERSON" ? "visits" : "service")

// Asset is deliberately absent: the name lives in one of three sibling tables
// reached through a polymorphic assetId/assetType pair with no foreign key, so
// SQL can't order by it. The asset filter covers that need instead.
const SORTABLE: SortMap<Prisma.ServiceRecordOrderByWithRelationInput> = {
  date: (dir) => [{ date: dir }],
  title: (dir) => [{ title: dir }],
  vendor: (dir) => [{ vendor: { sort: dir, nulls: "last" } }],
  cost: (dir) => [{ cost: { sort: dir, nulls: "last" } }],
}

export default async function RecordsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const fmt = await getFormat()
  const q = typeof params.q === "string" ? params.q : undefined
  const assetId = typeof params.assetId === "string" ? params.assetId : undefined

  const { page, per, skip, take, orderBy } = parseTableParams({
    searchParams: params,
    sortable: SORTABLE,
    defaultSort: DEFAULT_SORT,
    defaultDir: DEFAULT_DIR,
    tiebreaker: { id: "asc" },
  })

  const where: Prisma.ServiceRecordWhereInput = {
    AND: [
      ownedWhere(await loadFeatures()),
      assetId ? { assetId } : {},
      q ? { OR: [{ title: { contains: q } }, { vendor: { contains: q } }, { description: { contains: q } }] } : {},
    ],
  }

  const [records, total, costTotal, assets] = await Promise.all([
    prisma.serviceRecord.findMany({
      where,
      // Only the count is rendered, so the attachment rows themselves never need
      // to cross the wire.
      include: { _count: { select: { attachments: true } } },
      orderBy,
      skip,
      take,
    }),
    prisma.serviceRecord.count({ where }),
    // Aggregated over the whole filtered set — summing the current page would
    // silently turn this into "total cost of these 25 rows".
    prisma.serviceRecord.aggregate({ where, _sum: { cost: true } }),
    loadAssetIndex(),
  ])

  const pageCount = pageCountOf(total, per)
  // Keeps the URL honest when a filter shrinks the result below the current page.
  if (page > pageCount) redirect(`/records${withParams(params, { page: pageCount === 1 ? undefined : pageCount })}`)

  const totalCost = costTotal._sum.cost ?? 0
  const assetOptions = (Object.entries(assets.names) as [AssetType, Record<string, string>][]).flatMap(([type, byId]) =>
    Object.entries(byId).map(([id, name]) => ({ type, id, name }))
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-semibold">维护记录</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {total} 条记录
            {totalCost > 0 && ` · 共 ${fmt.money(totalCost)}`}
          </p>
        </div>
        <RecordsAddButton assets={assetOptions} />
      </div>

      <Suspense>
        <SearchBar
          placeholder="搜索标题、商家、备注…"
          filters={[{ key: "assetId", placeholder: "全部资产", options: assets.options }]}
        />
      </Suspense>

      {total === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">
          {q || assetId ? (
            <>
              <p className="font-medium">没有符合筛选条件的记录</p>
              <p className="text-sm mt-1">请尝试清除搜索或筛选条件。</p>
            </>
          ) : (
            <p className="font-medium">{emptyStateCopy("records")}</p>
          )}
        </div>
      ) : (
        <div className="rounded-lg border overflow-hidden bg-card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-muted-foreground">
                <tr>
                  <Suspense>
                    <UrlSortHead column="date" label="日期" initialDir="desc" defaultSort={DEFAULT_SORT} defaultDir={DEFAULT_DIR} />
                  </Suspense>
                  <th scope="col" className="text-left font-medium px-4 py-2.5">资产</th>
                  <Suspense>
                    <UrlSortHead column="title" label="维护项目" defaultSort={DEFAULT_SORT} defaultDir={DEFAULT_DIR} />
                  </Suspense>
                  <Suspense>
                    <UrlSortHead column="vendor" label="商家" className="hidden sm:table-cell" defaultSort={DEFAULT_SORT} defaultDir={DEFAULT_DIR} />
                  </Suspense>
                  <Suspense>
                    <UrlSortHead column="cost" label="费用" align="right" initialDir="desc" defaultSort={DEFAULT_SORT} defaultDir={DEFAULT_DIR} />
                  </Suspense>
                </tr>
              </thead>
              <tbody className="divide-y">
                {records.map((r) => {
                  const assetName = assets.assetName(r.assetType, r.assetId)
                  const AssetIcon = assetIcon[r.assetType]

                  return (
                    <tr key={r.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                        {fmt.date(r.date, { utc: true })}
                      </td>
                      <td className="px-4 py-3">
                        <Link href={assetHref(r.assetType, r.assetId)} className="flex items-center gap-1.5 hover:underline">
                          <AssetIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          {assetName ?? <span className="text-muted-foreground italic">未知</span>}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <RecordEditLink id={r.id}>
                          <Wrench className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          {r.title}
                          {r._count.attachments > 0 && (
                            <Badge variant="outline" className="h-4 px-1.5 text-xs">{r._count.attachments}</Badge>
                          )}
                        </RecordEditLink>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">{r.vendor}</td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {r.cost != null ? fmt.money(r.cost) : "—"}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <Suspense>
            <UrlPaginationBar page={page} pageCount={pageCount} total={total} per={per} label="条记录" />
          </Suspense>
        </div>
      )}
    </div>
  )
}
