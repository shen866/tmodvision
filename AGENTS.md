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

- 无数据库，所有状态存在 `./data/tModLoader/` 的 JSON/txt 文件中。
- 鉴权通过 `AUTH_TOKEN`（Bearer Token），无用户系统。
- 后端通过 Docker socket 管理 `TMOD_CONTAINER_NAME` 容器。
- 控制台命令通过 `docker exec <container> inject <cmd>` 注入 tmux 会话。
- 模组启用/禁用通过 `enabled.json`（字符串数组）控制。
- 工坊搜索需要 `STEAM_API_KEY`；未配置时仍可手动输入工坊 ID 安装。

## 修改后注意

- 修改后端源码后运行 `npm run build`。
- 修改前端源码后运行 `npm run build`；生产环境由后端托管 `dist/public`。
- Dockerfile 修改后重新 `docker compose build`。
