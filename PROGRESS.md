# LivePage 工作进度与交接（PROGRESS）

> 下次打开项目，先读这份，即可无缝续接。最后更新：2026-07-08。

## 当前阶段

**M1 编码中。** 阶段 0（脚手架）、阶段 1（core 双层总线）、阶段 2（services：room-manager/token/content-store）、阶段 3（room 建房/加入/重连，两端）已完成并通过浏览器端到端验证。**下一步：阶段 4.1** — 服务端内容上传 `POST /api/rooms/:roomId/content`（multipart + host 会话鉴权）→ content-store。
>
> 已验证流程：建房→跳转 `/room/:id`（host 角色）；访客加入→角色/人数正确；`participant:joined/left` 实时广播；离开→回首页；同浏览器 sessionId 重连以 host 恢复。28 个后端单测通过（room-manager 9 / token 7 / content-store 12）。

## 文档地图（读这些，按顺序）

| 文档 | 作用 | 状态 |
|------|------|------|
| `CLAUDE.md` | 给 AI 的项目导航 + 强制架构约束 | ✅ 最新，权威 |
| `LivePage_MVP_PRD_v2.md` | **产品规格（权威）** | ✅ 冻结 |
| `LivePage_技术设计文档.md` | **技术设计（权威）**：数据模型/事件协议/同步算法/语音抽象/模块化 | ✅ 冻结 |
| `LivePage_MVP_PRD.md`（v1） | 旧的「完整会议系统」构想 | ⚠️ 已废弃，仅存档对照 |
| `README.md` | 旧愿景 | ⚠️ 部分过时（仍写 mediasoup），待重写 |
| `AGENTS.md` / `AGENTS.zh-CN.md` | 早期贡献指南 | 参考 |

**冲突时以 PRD v2 + 技术设计文档为准。**

## 已冻结的核心决策（本轮讨论定案）

1. **定位**：从「开源会议系统」重构为「**实时演示同步工具**」，砍掉 mediasoup。
2. **内容加载**：上传（单 HTML / zip）→ 服务端**同源托管** → 父页面直接访问 iframe（不改写用户 HTML）。
3. **同步引擎（核心价值）**：视口锚点滚动 + 稳定选择器点击 + 页内导航；单一 `latestState` + version 去乱序。
4. **语音**：WebRTC **P2P Mesh**（复用 Socket.io 信令，后端零增量）。≤10 人自由发言，10~20 人强制 PTT，**硬上限 20**；PTT 用 `track.enabled` 只省带宽。
5. **语音迁移隔离**：mesh 几乎必被 SFU 取代 → 双侧 Provider 抽象（客户端 `VoiceProvider` + 服务端 `VoiceBackend`），`webrtc:signal` 由 mesh backend 独占，客户端从 join 快照 `voice.provider` 动态选型。切 LiveKit 只动 4 处（见技术设计 §7.4d）。
6. **权限**：静音 + 拉回 + **移交**（不做踢人）。
7. **Token**：分享链接 token 默认 24h、可配、非一次性、随房间销毁失效。
8. **架构基石**：core + features 模块化，**双层通信总线**（进程内 pub/sub + Socket.io `{type,v,payload}` 信封），三条低耦合铁律（features 互不 import / 依赖单向 features→core / 模块自包含）。新功能 = 加模块，不改核心。
9. **存储**：房间内存态 + bundle 落盘，MVP 无数据库。
10. **部署**：Docker Compose（app + nginx + 可选 coturn），1C2G。

## 里程碑

- **M1**：建房/加入 + 上传同源托管 + iframe 渲染 + 分享链接 ← **下一步从这里开始**
- **M2**：同步引擎（视口锚点 + 选择器点击 + 页内导航）——最难最核心
- **M3**：跟随/脱离/回归 + 权限（静音/拉回/移交）+ 断线重连
- **M4**：Mesh 语音（free/PTT）+ 静音状态 + Docker 部署 + 文档
- **v1.1（未来）**：LiveKit `VoiceProvider`/`VoiceBackend` 解锁 >20 人

## M1 开发任务清单（已拆解，2026-07-08）

M1 范围＝建房/加入 + 上传同源托管（含 zip slip 防护）+ iframe 渲染 + 分享链接（token）。
拆解原则：**core 先行、features 后挂**；三铁律（features 互不 import / 依赖单向 features→core / 模块自包含）从 M1 起强制。
执行顺序：**0 → 1(core) → 2(services) → 3(room) → 4(content/iframe) → 5(share)**。

### 阶段 0 · 工程脚手架（前置）
| # | 任务 | 模块 | 依赖 | 验收标准 | 状态 |
|---|------|------|------|----------|------|
| 0.1 | `git init` + `.gitignore`（node_modules、data/、.env） | 根 | — | git 可用，data/ 与密钥不入库 | ✅ |
| 0.2 | server 脚手架：`package.json`、`src/index.js`（HTTP+Socket.io 起服）、`config.js` | server | 0.1 | `npm run dev` 起服，健康检查返回 200 | ✅ |
| 0.3 | client 脚手架：Vite+React18+antd、`App.jsx` 路由 `/` 与 `/room/:id` | client | 0.1 | `npm run dev` 打开首页，路由可切换 | ✅ |

### 阶段 1 · core 核心（先行，两端对称）
| # | 任务 | 模块 | 依赖 | 验收标准 | 状态 |
|---|------|------|------|----------|------|
| 1.1 | 服务端 `core/bus.js`、`events.js`、`registry.js`（FeatureModule 装配） | server/core | 0.2 | registry.use() 能注册模块并调 init | ✅ |
| 1.2 | 服务端 `core/socket-gateway.js`：网络↔总线桥接 + `{type,v,payload}` 信封 + 未知 type 忽略 + host 权限校验 | server/core | 1.1 | 入站事件翻译为总线事件；非法 host 事件返回 error | ✅ |
| 1.3 | 客户端 `core/bus.js`、`events.js`、`registry.js`、`store.js`（分片状态仓） | client/core | 0.3 | 模块可注册、读写自身切片、只读订阅他片 | ✅ |
| 1.4 | 客户端 `core/socket.js`：socket 单例 + 网络↔总线桥接（唯一碰 socket 处） | client/core | 1.3 | 总线事件可上网、网络事件入总线 | ✅ |

### 阶段 2 · services 无状态基础设施
| # | 任务 | 模块 | 依赖 | 验收标准 | 状态 |
|---|------|------|------|----------|------|
| 2.1 | `services/room-manager.js`：Room/Participant 内存态 CRUD + 空房回收 | server/services | 1.1 | 建/查/删房、参与者增删、超时回收单测通过 | ✅ |
| 2.2 | `services/token.js`：分享链接 token 签发/校验（24h TTL、可配、随房销毁失效、非一次性） | server/services | 0.2 | 有效期内校验通过，过期/房销毁失败 | ✅ |
| 2.3 | `services/content-store.js`：bundle 落盘、zip 解压、**zip slip 防护**、类型白名单、≤50MB、入口识别 | server/services | 0.2 | 恶意 `../` 路径被拒；超限/非白名单被拒；index.html 识别 | ✅ |

### 阶段 3 · features · room（建房/加入/重连）
| # | 任务 | 模块 | 依赖 | 验收标准 | 状态 |
|---|------|------|------|----------|------|
| 3.1 | server `features/room`：`room:create`（nanoid 不可枚举 + passwordHash 加盐） | server/features/room | 2.1,2.2 | ack 返回 `{roomId, token, sessionId}`，创建者为 host | ✅ |
| 3.2 | server `features/room`：`room:join`（密码/token 校验）+ 加入快照(§5.3) + `participant:joined/left` 广播 | server/features/room | 3.1 | ack 返回完整快照；房号不可枚举 | ✅ |
| 3.3 | client `features/room`：Home 建房/加入表单 + Room 页装配 + sessionId 持久化 | client/features/room | 1.4 | 建房跳转 `/room/:id`；join 后拿快照渲染 | ✅ |

### 阶段 4 · features · content（上传同源托管 + iframe 渲染）
| # | 任务 | 模块 | 依赖 | 验收标准 | 状态 |
|---|------|------|------|----------|------|
| 4.1 | server：`POST /api/rooms/:roomId/content`（multipart，host 会话鉴权）→ content-store | server/features/content | 2.3,3.2 | 上传成功返回 ContentBundle；非 host 拒绝 | ⬜ |
| 4.2 | server：静态托管 `GET /content/:bundleId/*` + CSP/安全头(§8.3) | server/features/content | 4.1 | 同源可取内容页，响应头含 CSP | ⬜ |
| 4.3 | server：`content:set` → 更新房间 + 广播 `content:changed` | server/features/content | 4.1 | 全员收到内容切换事件 | ⬜ |
| 4.4 | client `features/content`：上传 UI（拖拽/zip）+ 进度 | client/features/content | 3.3,4.1 | 主持人可上传，见结果反馈 | ⬜ |
| 4.5 | client `features/sync/IframeStage.jsx`（M1 仅渲染）：sandbox iframe 加载 `/content/{id}/{entry}` | client/features/sync | 4.2,4.3 | iframe 同源渲染，属性 `allow-scripts allow-same-origin` | ⬜ |

### 阶段 5 · 分享链接闭环
| # | 任务 | 模块 | 依赖 | 验收标准 | 状态 |
|---|------|------|------|----------|------|
| 5.1 | client：Room 内「复制分享链接」（带 token） | client/features/room | 3.3,2.2 | 生成 `/room/:id?token=...` | ⬜ |
| 5.2 | client：带 token 进入自动 join（无需密码），过期回退到密码 | client/features/room | 5.1,3.2 | 有效 token 直进；过期提示输密码 | ⬜ |

> M1 不含同步引擎算法（M2）、语音（M4）；IframeStage 此阶段只渲染不采集。

## 待确认的开放问题（不阻塞 M1）

- 真·不限人数（LiveKit v1.1）的优先级与触发时机。
- Mesh 硬上限 20 是否需在压测后微调。
- `README.md` 是否需要按 v2 定位重写（当前仍描述 mediasoup 旧愿景）。

## 备注

- 项目**当前不是 git 仓库**（`git status` 无效）。如需版本管理，下次可先 `git init`。
- 尚未安装任何依赖、无 `package.json`、无 `docker-compose.yml`——这些都在 M1 产出。
