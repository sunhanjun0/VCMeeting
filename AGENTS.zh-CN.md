# 贡献指南

本仓库尚处早期阶段：目前仅有 `README.md`。下述目录结构与命令依据 README 中描述的架构编写，应作为后续贡献的目标结构。

## 项目结构与模块组织

- `server/` — 信令服务器与 mediasoup SFU（Node.js）。入口为 `server/src/index.js`；SFU 与房间逻辑位于 `server/src/services/`；信令处理位于 `server/src/socket/handlers.js`。
- `client/` — React 18 + Vite + Ant Design（antd）前端。界面代码位于 `client/src/`（如 `App.jsx`）。
- `pocs/` — 技术验证（`mediasoup-poc/`、`iframe-sync-poc/`）；实验代码放在此处，勿混入 `server/` 或 `client/`。
- `nginx/nginx.conf` — 反向代理配置。`docker-compose.yml` — 服务编排。
- 文档（`LivePage_*.md`）位于仓库根目录。

## 构建、测试与开发命令

```bash
docker compose up -d          # 构建并启动整套服务，访问 http://localhost
cd server && npm install      # 安装后端依赖
cd server && npm run dev      # 以热重载方式运行信令服务器
cd client && npm install      # 安装前端依赖
cd client && npm run dev      # 启动 Vite 开发服务器
cd client && npm run build    # 生成生产环境构建产物
```

## 代码风格与命名规范

- JavaScript/JSX、JSON、YAML 使用 2 空格缩进。
- React 组件用 `PascalCase.jsx`；工具与服务用 `kebab-case.js`（如 `room-manager.js`）。
- 优先使用 ES 模块，变量与函数使用 `camelCase`。
- 界面优先使用 Ant Design（antd）组件，避免重复造轮子；自定义 CSS 从简，优先用 antd 主题定制。
- 提交前运行 ESLint 与 Prettier；以各自包内的配置为准。

## 测试指南

- 目前尚无测试套件。新增时，前端使用 Vitest，后端使用 Node 内置测试运行器（或 Jest）。
- 测试文件命名为 `*.test.js` / `*.test.jsx`，与源码同目录或置于 `__tests__/` 下。
- 通过各包的 `npm test` 运行测试，覆盖房间生命周期、信令与 iframe 同步等路径。

## 提交与 Pull Request 规范

- 尚无提交历史；建议采用 Conventional Commits（如 `feat: add room join flow`、`fix: handle SFU reconnect`）。
- 提交保持聚焦，使用祈使语气。
- PR 应包含清晰描述、关联 issue、测试说明，UI 改动附截图或短视频。

## 安全与配置提示

- 密钥保存在 `.env` 文件中（加入 gitignore），切勿提交凭据。
- 采用 AGPLv3 许可证，请确保贡献符合该许可。
