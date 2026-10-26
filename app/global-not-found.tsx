import type { Metadata } from "next"
import { Home, SearchX } from "lucide-react"
import Link from "next/link"
import { fontVariables } from "./fonts"
import "./globals.css"

export const metadata: Metadata = {
  title: "未找到页面 — HomeCenter",
  description: "您访问的页面不存在。",
}

export default function GlobalNotFound() {
  return (
    <html lang="en" className={`${fontVariables} h-full antialiased`}>
      <body className="min-h-full bg-muted/40 text-foreground">
        <div className="min-h-svh flex items-center justify-center p-4">
          <div className="w-full max-w-sm space-y-6 text-center">
            <div className="flex flex-col items-center gap-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <Home className="h-5 w-5" />
              </div>
              <h1 className="font-heading text-2xl font-semibold tracking-tight">HomeCenter</h1>
            </div>
            <div className="rounded-lg border bg-card p-8">
              <SearchX className="h-8 w-8 mx-auto mb-3 text-muted-foreground/60" strokeWidth={1.5} />
              <p className="font-medium">页面未找到</p>
              <p className="text-sm text-muted-foreground mt-1">
                您访问的页面不存在或可能已被移动。
              </p>
              <Link href="/" className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg bg-primary px-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/80 transition-colors mt-5">
                返回仪表盘
              </Link>
            </div>
          </div>
        </div>
      </body>
    </html>
  )
}
