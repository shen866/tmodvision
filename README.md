# tModVision

面向个人的 tModLoader 服务器搭建与管理平台。

## 特性

- 🎮 **服务器管理**：启动 / 停止 / 重启 tModLoader 服务端容器
- 📦 **模组管理**：搜索 Steam 创意工坊、一键安装、启用 / 禁用
- 🌍 **世界管理**：创建 / 删除 / 备份 / 切换世界
- ⚙️ **配置编辑**：可视化修改 `serverconfig.txt`
- 💬 **实时控制台**：WebSocket 日志流 + 发送游戏命令
- 🔒 **Token 鉴权**：无数据库、无用户系统，单 Token 管理

## 技术栈

- 后端：Node.js + Express + TypeScript + Dockerode + WebSocket
- 前端：React + Vite + TypeScript + shadcn/ui 风格 + Tailwind CSS
- 部署：Docker Compose on Linux

## 快速开始

在部署主机的项目目录运行以下命令。宿主机需要 Python 3.8+、可用的本机 Docker Engine 和支持 `up --wait` 的 Docker Compose v2 或更高版本。

```bash
./tmodvision start
```

首次启动会显示主机名、网卡地址、已有面板挂载和服务器清单，依次选择公网 IP 或域名、管理来源、数据目录和管理员 Token。确认摘要后才应用配置。已有部署会优先沿用实际数据挂载，并可保留原有有效 Token。后续执行相同命令会使用保存的配置；游戏服版本、端口和模组在网页登录后分别设置。

**云安全组和 DNS**

- 允许公网入站 **TCP 80**，用于首次签发和后续 HTTP-01 验证；普通网页访问会在证书就绪后跳转到 HTTPS。
- 允许管理端入站 **TCP 443**，网页、API 和控制台 WSS 共用此端口。选择指定来源时，在向导中输入 IPv4、IPv6 或 CIDR；安全组可设置同样的限制。网关按直连客户端地址判断，部署在 CDN 或其他代理之后时，应在最外层另行设置访问限制。
- 域名的 A / AAAA 记录应指向能够到达这台主机的公网入口。IP 模式填写云服务商分配的公网地址；NAT 部署需将 80 和 443 转发到本机。玩家按需访问各游戏端口。
- 后端只在 Compose 网络内监听 3000。网关会校验来源并转发 WebSocket；浏览器使用 12 小时的安全会话 Cookie。脚本仍可通过 Bearer Token 调用 API。

**证书与恢复**

使用 Nginx、Certbot webroot 和 Let's Encrypt。IP 模式请求短期 IP 证书，域名模式请求域名证书。续期容器每 6 小时检查当前入口，续期后网关自动重载证书。首次签发失败时，先检查 DNS、安全组、端口转发和主机防火墙，再运行 `./tmodvision start` 继续。切换地址时，旧 HTTPS 入口持续提供服务，待新证书通过校验再提交设置。[公开 IP 证书说明](https://letsencrypt.org/2026/03/11/shorter-certs-certbot)

| 命令 | 用途 |
|---|---|
| `./tmodvision start` | 首次初始化，或按已保存设置启动、重试 |
| `./tmodvision configure` | 更换访问地址、管理来源或凭据，确认后应用 |
| `./tmodvision status` | 查看容器、游戏服数量、证书到期时间和最近续期结果 |
| `./tmodvision doctor` | 检查本机 TLS、DNS、WSS、数据挂载和后端健康状态 |
| `./tmodvision stop` | 停止面板、网关和续期服务；游戏容器继续运行 |
| `./tmodvision token reset` | 生成新管理员 Token 并使原会话失效 |

部署状态和管理凭据保存在项目的 `.tmodvision/`（配置文件权限 0600），证书和 ACME 账户保存在 Compose 的 `certificates` 卷。备份部署时一并妥善保管这些内容和游戏数据目录。首次生成的 Token 在终端显示一次。可选工坊搜索密钥仍从项目 `.env` 的 `STEAM_API_KEY` 读取。

## 目录说明

- `./data/tModLoader/Mods/`：模组文件与 `enabled.json`
- `./data/tModLoader/Worlds/`：世界文件
- `./data/tModLoader/backups/`：世界备份
- `./data/tModLoader/serverconfig.txt`：服务器配置
- `./data/steamMods/`：Steam 工坊下载缓存

## 模组安装

### 从本地文件安装

在目标服务器的“模组”页导入已有的 `.tmod` 文件，选择下次启动时启用，再从运行概览应用变更。Docker Desktop 上遇到 SteamCMD 下载失败时也可使用这个入口。

### 通过工坊搜索安装

在 `.env` 中配置 `STEAM_API_KEY`，然后在“模组”页搜索并安装。

### 通过工坊 ID 安装

无需 Steam API Key。在模组详情页 URL 中找到 `id=123456789`，在“通过工坊 ID 安装”中输入并安装。

## 常见问题

- **服务端镜像首次构建较慢**：需要从 GitHub Release 下载 tModLoader 并安装 .NET 运行时。
- **世界创建需要等待**：后端会等待 `.wld` 与 `.twld` 文件生成，最多 5 分钟。
- **命令无响应**：确保 tmodloader 容器已启动并处于运行状态。

## 许可证

MIT

## 多服运行管理

服务器总览展示各服的游戏就绪状态、容器版本、启动世界和在线人数。进入一台服后，可以在左侧切换服务器并保留当前页面；窄屏使用顶部的“导航”。

每台服可以固定一个官方 tModLoader 发布标签。同一发布版本复用镜像。修改启动计划后可提前准备镜像，再择时应用；切换版本或对外端口会重新创建该服容器并复用其数据目录。模组安装文件和启用清单独立保存在各服的数据目录中，工坊下载缓存共享。已有服务器保留原有版本，首次通过面板启动或重启后开始记录启动世界、配置和模组快照。

面板每五秒采样运行容器，保留最近 60 次 CPU 和内存数据。就绪状态和在线玩家来自本次启动的游戏日志；采样中断时显示未知。面板从游戏日志读取已加载的模组及版本；缺少可识别日志时，显示启动清单和待确认状态。
