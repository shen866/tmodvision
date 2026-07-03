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

1. 克隆仓库并进入目录：

```bash
git clone <repo>
cd tmodvision
```

2. 创建环境变量文件：

```bash
cp .env.example .env
# 编辑 .env，至少设置 AUTH_TOKEN
```

3. 启动服务：

```bash
docker compose up -d --build
```

4. 打开浏览器访问 `http://<服务器IP>:3000`，输入 `AUTH_TOKEN` 登录。

5. 在面板中点击“新建服务器”，按需创建世界或配置已有世界，然后到“服务器”页面启动服务端。

## 目录说明

- `./data/tModLoader/Mods/`：模组文件与 `enabled.json`
- `./data/tModLoader/Worlds/`：世界文件
- `./data/tModLoader/backups/`：世界备份
- `./data/tModLoader/serverconfig.txt`：服务器配置
- `./data/steamMods/`：Steam 工坊下载缓存

## 模组安装

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
