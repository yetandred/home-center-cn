import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { InstalledNotice } from "@/components/settings/installed-notice"

export default async function InstallPage() {
  const session = await auth()
  if (!session) redirect("/login")

  // Any signed-in user can open this page, but the Features tab is admin-only.
  const backHref = session.user.role === "ADMIN" ? "/settings?tab=features" : "/"

  return (
    <div className="max-w-2xl space-y-6">
      <div className="space-y-2">
        <Link
          href={backHref}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          {session.user.role === "ADMIN" ? "返回设置" : "返回仪表盘"}
        </Link>
        <h1 className="font-heading text-2xl font-semibold">将 HomeCenter 安装为应用</h1>
        <p className="text-sm text-muted-foreground">
          把 HomeCenter 添加到主屏幕。它会像其他应用一样，以自己的图标全屏打开。无需从应用商店下载任何内容，随时可以移除。
        </p>
      </div>

      <InstalledNotice />

      <Card className="py-5">
        <CardHeader className="px-5">
          <CardTitle>iPhone 和 iPad</CardTitle>
          <CardDescription>请在设备本身上操作，并在 Safari 中打开 HomeCenter。</CardDescription>
        </CardHeader>
        <CardContent className="px-5">
          <ol className="list-decimal space-y-2 pl-5 text-sm">
            <li>在 <strong>Safari</strong> 中打开 HomeCenter 并登录。</li>
            <li>点击工具栏中的<strong>分享</strong>按钮（带向上箭头的方框图标）。</li>
            <li>向下滚动并点击<strong>添加到主屏幕</strong>。如果没有看到，请先点击<strong>更多</strong>。</li>
            <li>保留名称 <strong>HomeCenter</strong>，然后点击<strong>添加</strong>。</li>
            <li>从主屏幕上的新图标打开 HomeCenter。</li>
          </ol>
          <p className="mt-3 text-xs text-muted-foreground">
            其他 iOS 浏览器（Chrome、Edge）在 iOS 16.4 及以上版本也可以从其分享菜单完成此操作；Safari 则在所有版本上均可用。
          </p>
        </CardContent>
      </Card>

      <Card className="py-5">
        <CardHeader className="px-5">
          <CardTitle>Android 以及桌面版 Chrome 或 Edge</CardTitle>
        </CardHeader>
        <CardContent className="px-5">
          <p className="text-sm">
            打开浏览器菜单，选择<strong>安装应用</strong>（或<strong>添加到主屏幕</strong>）。
          </p>
        </CardContent>
      </Card>

      <Card className="py-5">
        <CardHeader className="px-5">
          <CardTitle>须知</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 px-5 text-sm text-muted-foreground">
          <p>安装后的应用就是同一个网站：它需要网络连接，并使用与浏览器相同的登录凭据。</p>
          <p>
            通过 <strong>https</strong> 访问效果最佳。如果您在局域网内通过纯 http 地址访问 HomeCenter，iOS 仍会添加图标，但可能以普通浏览器标签页的方式打开。
          </p>
          <p>如需移除，请在主屏幕上长按图标并选择移除应用。</p>
        </CardContent>
      </Card>
    </div>
  )
}
