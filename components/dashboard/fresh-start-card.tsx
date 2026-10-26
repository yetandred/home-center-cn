import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { buttonVariants } from "@/components/ui/button"

/** Shown to admins while HomeCenter holds no assets or records. */
export function FreshStartCard() {
  return (
    <Card className="py-5">
      <CardHeader className="px-5">
        <CardTitle>欢迎使用 HomeCenter</CardTitle>
        <CardDescription>从头开始，或从另一个 HomeCenter 的备份导入全部内容。</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2 px-5">
        <Link href="/assets/properties" className={buttonVariants()}>添加第一个资产</Link>
        <Link href="/settings?tab=data#restore" className={buttonVariants({ variant: "outline" })}>从备份恢复</Link>
      </CardContent>
    </Card>
  )
}
