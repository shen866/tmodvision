# Agent Notes

## 项目结构

- `tmodloader/`：tModLoader 服务端 Docker 镜像（基于官方 GitHub Release + tmux inject）。
- `server/`：Node.js + TypeScript 后端，Express 路由 + WebSocket 控制台 + Dockerode。
- `web/`：React + Vite + Tailwind 前端，UI 组件位于 `web/src/components/ui/`。
- `docker-compose.yml`：组合 tModVision 面板与 tModLoader 服务端。
- `.env.example`：所有可配置环境变量模板。

## 开发/构建命令

```bash
# 后端
npm install
npm run build

# 前端
npm install
npm run build

# 完整部署
docker compose up -d --build
```

## 关键约定

- 无数据库，所有状态存在 `./data/` 的 JSON/txt 文件中。
- 鉴权通过 `AUTH_TOKEN`（Bearer Token），无用户系统。
- 后端通过 Docker socket 管理 `TMOD_CONTAINER_NAME` 容器。
- 控制台命令通过 `docker exec <container> inject <cmd>` 注入 tmux 会话。
- 模组启用/禁用通过 `enabled.json`（字符串数组）控制。
- 工坊搜索需要 `STEAM_API_KEY`；未配置时仍可手动输入工坊 ID 安装。
- 多服配置通过 `./data/servers.json` 管理；未配置时面板显示空状态，用户需手动点击“新建服务器”创建。
- Docker Desktop macOS 用户需设置 `HOST_DATA_DIR` 为 `./data` 在宿主机上的绝对路径（如 `/Users/<you>/tmodvision/data`），否则通过 ID 安装模组或创建世界时会因宿主机路径未共享而报错。
- 每个服务器拥有独立的 `dataDir`，但 `steamMods` 目录在所有服务器间共享，避免重复下载工坊模组。
- 新建服务器时，后端会将 `/app/tmodloader-template`（Docker 镜像内）或项目根目录 `tmodloader/` 复制到新服的 compose 目录。
- 备份文件命名规范：`<serverId>-<worldName>-<timestamp>.zip`，存放于各服 `tModLoader/backups/`。
- 自动备份配置保存在 `./data/backup-config.json`，进程启动时恢复调度。
- 资源管理中的缓存清理仅删除未被任何服务器 `enabled.json` 引用的 `steamMods` 工坊目录。

## 修改后注意

- 修改后端源码后运行 `npm run build`。
- 修改前端源码后运行 `npm run build`；生产环境由后端托管 `dist/public`。
- Dockerfile 修改后重新 `docker compose build`。
