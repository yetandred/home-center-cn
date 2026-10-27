// 重置用户登录密码（忘记密码且未配置 SMTP 时的自救工具）。
// 用法：
//   npx tsx scripts/reset-password.ts <新密码>              # 数据库只有一个管理员时
//   npx tsx scripts/reset-password.ts <新密码> <邮箱>       # 多个用户时指定账号
// 新密码至少 8 位。重置后该账号的所有已登录会话立即失效。
// 在 Docker 中运行：docker compose exec homecenter npx tsx scripts/reset-password.ts ...
import bcrypt from "bcryptjs"
import { PrismaClient } from "../app/generated/prisma/client"
import { PrismaLibSql } from "@prisma/adapter-libsql"

const url = process.env.DATABASE_URL ?? "file:/data/homecenter.db"
const prisma = new PrismaClient({ adapter: new PrismaLibSql({ url }) })

async function main() {
  const [password, email] = process.argv.slice(2)

  if (!password || password.length < 8) {
    console.error("用法：npx tsx scripts/reset-password.ts <新密码(至少8位)> [邮箱]")
    process.exit(1)
  }

  const users = await prisma.user.findMany({
    select: { id: true, email: true, name: true, role: true },
    orderBy: { createdAt: "asc" },
  })
  if (users.length === 0) {
    console.error("数据库里没有任何用户（意外状态，正常不该发生）。")
    process.exit(1)
  }

  let target
  if (email) {
    target = users.find((u) => u.email.toLowerCase() === email.toLowerCase())
    if (!target) {
      console.error(`找不到邮箱 ${email}。现有用户：`)
      for (const u of users) console.error(`  - ${u.email}（${u.role}）`)
      process.exit(1)
    }
  } else {
    const admins = users.filter((u) => u.role === "ADMIN")
    if (admins.length !== 1) {
      console.error(`数据库里有 ${admins.length} 个管理员，请指定要重置的邮箱。用户列表：`)
      for (const u of users) console.error(`  - ${u.email}（${u.role}）`)
      process.exit(1)
    }
    target = admins[0]
  }

  const passwordHash = await bcrypt.hash(password, 12)
  await prisma.user.update({
    where: { id: target.id },
    // sessionVersion 自增让这个账号的所有已登录会话全部失效
    data: { passwordHash, sessionVersion: { increment: 1 } },
  })
  console.log(`✓ 已重置 ${target.name} <${target.email}> 的密码（会话已全部失效，请重新登录）。`)
  await prisma.$disconnect()
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
