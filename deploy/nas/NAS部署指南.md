# HomeCenter 中文版 · NAS Docker 部署指南

本文对应「用 GitHub Actions 构建多架构镜像 → NAS 拉取运行」这条路线。
全程不需要 NAS 自己编译，NAS 只需要能 `docker pull`。

---

## 0. 先确认两件事

### ① NAS 的 CPU 架构

SSH 登录 NAS 后执行：

```bash
uname -m
```

- `x86_64` → linux/amd64（威联通 TS-x5x、绿联 DXP 系列、极空间 Z 系列、TrueNAS 基本都是这个）
- `aarch64` → linux/arm64（部分威联通 TS-133、群晖 DS223 这类 ARM 型号）

工作流默认**同时构建两种架构**，所以不确定也无所谓，只是构建时间翻倍。确定是 x86 的话，建议手动触发时只选 `linux/amd64`，能省一半时间。

### ② NAS 的内存

应用本身不重，**2GB 可用内存**就够跑。但要注意 SQLite 数据库在 NAS 的存储卷上，别放在某些会休眠的机械盘上（响应会很慢）。

---

## 1. 把代码推到你的 GitHub（✅ 已完成，本节仅备查）

仓库：`github.com/yetandred/home-center-cn`（public），分支 `zh-CN` 已推送。以下步骤仅在重建仓库时需要。

代码目前在本机 `D:\AI_Agent\workspace\2026-10-26-10-28-34\home-center`，分支是 `zh-CN`。

在 GitHub 网页上新建一个仓库（**Private 私有**即可，别选自动生成 README），然后在本机执行：

```bash
cd D:/AI_Agent/workspace/2026-10-26-10-28-34/home-center
git remote add origin git@github.com:yetandred/home-center-cn.git
git push -u origin zh-CN
```

> **代理提醒**：HTTPS 方式的 git 通道走代理会被 502，实际走的是 SSH over 443（`~/.ssh/config` 已把 github.com 指到 ssh.github.com:443，公钥已加到账号）。

推送成功后，仓库里应该能看到 `.github/workflows/docker-zh-cn.yml`。

---

## 2. 触发构建

推送 `zh-CN` 分支会自动触发。也可以去仓库的 **Actions → Docker (zh-CN) → Run workflow** 手动跑：

| 参数 | 说明 |
|---|---|
| `platforms` | 架构。x86 NAS 选 `linux/amd64`；不确定就用默认的双架构 |
| `push` | 保持勾选，才会推到 GHCR |

**耗时**：单架构约 15–25 分钟，双架构（arm64 走 QEMU 模拟）约 40–70 分钟。第一次因为没有缓存是最慢的。

构建完成后，镜像在：

```
ghcr.io/yetandred/home-center-cn:zh-cn
```

同时还有 `zh-cn-20261026` 和 `zh-cn-<commit短哈希>` 两个标签，方便回滚。

---

## 3. 让 NAS 能拉到这个镜像

GHCR 的镜像默认继承仓库的可见性。

### 情况 A：仓库设为 Public

镜像公开，NAS 直接 pull，**不需要登录**，最省事。适合只在家里内网跑的情况（注意：公开仓库意味着你改的代码人人可见）。

### 情况 B：仓库保持 Private（推荐）

NAS 需要先登录一次。步骤：

1. GitHub → 右上头像 → **Settings → Developer settings → Personal access tokens → Tokens (classic) → Generate new token**
2. 勾选 **`read:packages`** 一项即可，有效期自己定
3. 在 NAS 的 SSH 里执行：

```bash
docker login ghcr.io -u yetandred -p <刚生成的token>
```

4. 登录信息会存在 `~/.docker/config.json`，之后 `docker pull` 就不用再登了

> 注意：包（Package）第一次生成时可能和企业/账号的默认可见性有关，如果 push 成功但 pull 报 `denied`，去 **个人主页 → Packages → homecenter → Package settings** 确认可见性，并检查它有没有关联到你的私有仓库。

---

## 4. 在 NAS 上部署

### 4.1 建目录

```bash
# 群晖 / 绿联 / 极空间
mkdir -p /volume1/docker/homecenter/data

# 威联通
mkdir -p /share/Container/homecenter/data

# TrueNAS
mkdir -p /mnt/<池名>/apps/homecenter/data
```

### 4.2 放 compose 文件

把仓库里的 `deploy/nas/docker-compose.yml` 传上去（或者直接在 NAS 上 `vi` 新建）。

### 4.3 改三处

| 位置 | 改成什么 |
|---|---|
| `image:` | `ghcr.io/yetandred/home-center-cn:zh-cn`（deploy 文件里已填好，不用改） |
| `volumes:` | 上一步建的绝对路径，例如 `/share/Container/homecenter/data:/data` |
| `AUTH_SECRET:` | 执行 `openssl rand -base64 32` 生成，粘进去 |

顺手把 `ADMIN_EMAIL` / `ADMIN_PASSWORD` 改成你要的。

### 4.4 启动

```bash
cd /share/Container/homecenter   # 换成你放 compose 的目录
docker compose up -d
docker compose logs -f
```

首次启动它会自动做三件事（日志里能看到）：

1. 应用数据库迁移（36 个迁移）
2. 创建管理员账号
3. 启动服务

看到 `Ready` 之类字样、健康检查转成 `healthy`（`docker ps` 里 STATUS 列）就成功了。

### 4.5 访问

浏览器打开：

```
http://<NAS的内网IP>:3000
```

用 `ADMIN_EMAIL` / `ADMIN_PASSWORD` 登录。

**建议接着做的两件事**：

- 进 **设置 → 数据 → 备份**，把备份目录指到第二块盘（compose 里加一行 `/volume2/backups:/backups` 之类的挂载），并且开启定时备份
- 进 **设置 → 区域**，确认货币是 ¥、单位是公里/平方米、日期格式符合习惯（默认已经调好了）

---

## 5. 日常运维

### 升级到新版本

```bash
docker compose pull
docker compose up -d
```

数据库迁移会在容器启动时自动执行，不需要手动操作。

### 回滚

镜像标签带了日期和 commit 哈希：

```bash
# 看有哪些标签：GitHub → 个人主页 → Packages → homecenter
docker pull ghcr.io/yetandred/home-center-cn:zh-cn-20261027
# 改 compose 里的 image 为这个标签，再 up -d
```

### 备份

两种方式，建议都用：

- **应用内备份**：设置 → 数据 → 备份，生成加密压缩包，可以下载或存到挂载的 `/backups` 目录
- **整目录快照**：直接备份 `/data` 目录（含 SQLite 文件和附件）。**必须停容器再拷**，否则 SQLite 可能拷到写了一半的状态：
  ```bash
  docker compose stop && tar czf homecenter-data-$(date +%F).tar.gz data/ && docker compose start
  ```

### 看日志 / 排错

```bash
docker compose logs --tail=200 homecenter
docker inspect --format '{{json .State.Health}}' homecenter   # 健康检查详情
```

---

## 6. 常见问题

### `docker pull` 卡住或超时

国内直连 ghcr.io 经常不稳。三种解法，按推荐顺序：

1. **给 NAS 的 Docker 配代理**（QNAP Container Station / 群晖 Container Manager 都支持在设置里填 HTTP 代理；或改 `/etc/docker/daemon.json` 加 `proxies` 段后重启 docker）
2. **找一台能连 GitHub 的机器中转**：在那台机器 `docker pull` 后 `docker save -o homecenter.tar ghcr.io/...:zh-cn`，把 tar 传到 NAS，再 `docker load -i homecenter.tar`——这就是"帮我打个镜像文件"的等价做法，只是包会比较大（约 1.5–2 GB）
3. 用第三方镜像加速站代理 ghcr（如 `ghcr.nju.edu.cn` 之类），把 compose 里的 image 换成加速站地址。**这类站点可用性不保证，只建议临时用**

### 容器起来了但页面打不开

- 确认 `docker ps` 里端口映射是 `0.0.0.0:3000->3000/tcp`，不是只绑了 `127.0.0.1`
- NAS 自带防火墙要放行 3000 端口
- 用 `curl http://127.0.0.1:3000/api/health`（在 NAS 上跑）区分是应用问题还是网络问题

### 报 `AUTH_SECRET` 相关错误 / 一直被登出

`AUTH_SECRET` 没设或改过。设一个固定值后重启；改过的话所有人都要重新登录（数据不受影响）。

### 忘记管理员密码

两种方式，选其一：

**方式一（推荐）：应用内自助重置。** 配置了 SMTP 邮件的话，在登录页点「忘记密码」，收邮件里的重置链接。

**方式二：终端脚本重置**（未配置邮件时的自救，镜像 `zh-cn-20261027` 及以后内置）：

```bash
# 只有一个管理员时，直接重置：
docker compose exec homecenter npx tsx scripts/reset-password.ts 新密码至少8位

# 有多个用户时，指定邮箱：
docker compose exec homecenter npx tsx scripts/reset-password.ts 新密码 你的邮箱@例.com
```

重置后该账号所有已登录的会话立即失效，需要重新登录。旧镜像里没有这个脚本的话，升级一次（`docker compose pull && docker compose up -d`）即可。

### 附件上传失败

检查 `MAX_UPLOAD_BYTES`，以及 NAS 反向代理（如果有）的请求体上限——群晖的反向代理默认 1MB 上限会卡死上传。

---

## 7. 备选方案：不用 GitHub，直接在 NAS 上构建

如果 GHCR 完全拉不动、又不想折腾代理，可以把源码直接拷到 NAS 上构建：

```bash
# 把整个 home-center 目录（不含 node_modules、.next）拷到 NAS，然后
cd /share/Container/homecenter-src
docker compose build          # 用的是仓库自带的 docker-compose.yml，需要先把 image 改成自定义名字
docker compose up -d
```

**要求**：NAS 内存 ≥ 4GB（Next.js 构建吃内存，2GB 容易 OOM），构建时间 30–90 分钟，且 NAS 需要能访问 npm 源和 HuggingFace（构建时要下载内置向量模型）。

内存吃紧的机型不建议走这条路，容易在 `npm run build` 阶段被 OOM Killer 杀掉。

---

## 附：这次改动涉及的文件

| 文件 | 作用 |
|---|---|
| `.github/workflows/docker-zh-cn.yml` | CI：类型检查 → 多架构构建 → 推 GHCR |
| `deploy/nas/docker-compose.yml` | NAS 侧部署文件（带注释，改三处即可） |
| `deploy/nas/NAS部署指南.md` | 本文 |
| `Dockerfile` | 上游原文件，**未改动**，可直接用 |
