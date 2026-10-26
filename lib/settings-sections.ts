import { Bell, Bot, DatabaseBackup, FileSearch, Globe, Mail, Palette, ToggleRight, Users } from "lucide-react"

// The sub-pages of Settings, chosen with ?tab= like the asset pages' tabs.
// Everyone gets their own email preferences and appearance; the rest is server setup.

export type SettingsSectionId = "notifications" | "appearance" | "features" | "regional" | "mail" | "assistant" | "documents" | "users" | "data"

export type SettingsSection = {
  id: SettingsSectionId
  label: string
  description: string
  icon: React.ElementType
  adminOnly: boolean
}

export const SETTINGS_SECTIONS: SettingsSection[] = [
  { id: "notifications", label: "通知", description: "到期事项的邮件通知频率", icon: Bell, adminOnly: false },
  { id: "appearance", label: "外观", description: "本设备上的界面布局", icon: Palette, adminOnly: false },
  { id: "features", label: "功能", description: "开启或关闭站点的可选功能", icon: ToggleRight, adminOnly: true },
  { id: "regional", label: "区域", description: "货币、单位与日期格式", icon: Globe, adminOnly: true },
  { id: "mail", label: "邮件服务器", description: "用于发送提醒的 SMTP 服务器", icon: Mail, adminOnly: true },
  { id: "assistant", label: "AI 助手", description: "AI 助手的模型与行为", icon: Bot, adminOnly: true },
  { id: "documents", label: "文档与搜索", description: "读取上传文件、OCR 与语义搜索", icon: FileSearch, adminOnly: true },
  { id: "users", label: "用户", description: "谁可以登录及其角色", icon: Users, adminOnly: true },
  { id: "data", label: "数据与备份", description: "HomeCenter 全部数据的备份、恢复与导出", icon: DatabaseBackup, adminOnly: true },
]

export function visibleSections(isAdmin: boolean): SettingsSection[] {
  return SETTINGS_SECTIONS.filter((s) => isAdmin || !s.adminOnly)
}

/** The requested section if this user may see it, else the first one. */
export function resolveSection(tab: string | string[] | undefined, isAdmin: boolean): SettingsSection {
  const visible = visibleSections(isAdmin)
  const want = Array.isArray(tab) ? tab[0] : tab
  return visible.find((s) => s.id === want) ?? visible[0]
}

export const settingsHref = (id: SettingsSectionId) => `/settings?tab=${id}`
