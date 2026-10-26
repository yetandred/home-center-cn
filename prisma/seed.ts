import { PrismaClient } from "../app/generated/prisma/client"
import { PrismaLibSql } from "@prisma/adapter-libsql"
import bcrypt from "bcryptjs"

const url = process.env.DATABASE_URL ?? "file:./prisma/dev.db"
const adapter = new PrismaLibSql({ url })
const prisma = new PrismaClient({ adapter })

async function main() {
  const existing = await prisma.user.findFirst({ where: { role: "ADMIN" } })
  if (existing) {
    console.log("管理员用户已存在——跳过 seed。")
    return
  }

  // Read from env vars; fall back to insecure defaults that force a password reset
  const name = process.env.ADMIN_NAME ?? "管理员"
  const email = process.env.ADMIN_EMAIL ?? "admin@localhost"
  const password = process.env.ADMIN_PASSWORD ?? "changeme"
  const mustReset = !process.env.ADMIN_PASSWORD // force reset only when using the default

  const passwordHash = await bcrypt.hash(password, 12)
  const admin = await prisma.user.create({
    data: { name, email, passwordHash, role: "ADMIN", mustResetPassword: mustReset },
  })

  console.log(`已创建管理员：${admin.email}`)
  if (mustReset) {
    console.log(`默认密码：${password}——首次登录时会要求您修改。`)
    console.log("提示：在 seed 前设置 ADMIN_NAME、ADMIN_EMAIL、ADMIN_PASSWORD 环境变量可跳过此提示。")
  } else {
    console.log("已使用您提供的密码创建管理员。")
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
