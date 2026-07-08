# LivePage 技术设计文档（TDD）

| 项目 | 内容 |
|------|------|
| 文档版本 | v1.0 |
| 对应需求 | `LivePage_MVP_PRD_v2.md`（v2） |
| 状态 | 草稿 |
| 更新日期 | 2026-07-07 |

> 本文把 PRD v2 的功能需求落成可实现的技术契约：数据模型、Socket.io 事件协议、同步引擎算法、WebRTC Mesh 信令流程、上传托管管线、目录结构与部署拓扑。是 M1 任务拆解的直接依据。

---

## 1. 范围与设计原则

- **同源是一切的前提**：上传内容托管在与应用同源的路径下，父页面可直接访问 `iframe.contentDocument`，无需改写用户 HTML 即可采集/应用事件。
- **单一状态源**：房间只维护一份 `latestState`，同时服务「首次同步 / 断线补齐 / 主持人重连」。
- **服务端无媒体**：Socket.io 只做房间状态与 WebRTC 信令中转，音频全程 P2P。
- **可替换语音层**：语音行为收敛到 `VoiceProvider` 接口，MVP 只实现 `MeshProvider`。

## 2. 系统架构总览

```
┌─────────── Browser (Host) ───────────┐        ┌────────── Browser (Guest) ──────────┐
│  React App                            │        │  React App                           │
│   ├─ IframeStage (same-origin iframe) │        │   ├─ IframeStage (follower)          │
│   │    └─ SyncAgent(host): 采集       │        │   │    └─ SyncAgent(follower): 应用  │
│   ├─ MeshProvider (WebRTC)            │◄──P2P──►│   ├─ MeshProvider (WebRTC)           │
│   └─ SocketClient                     │        │   └─ SocketClient                    │
└──────────────┬────────────────────────┘        └───────────────┬──────────────────────┘
               │ Socket.io (状态 + 信令中转)                      │
               ▼                                                  ▼
        ┌──────────────────────── Node.js Server ────────────────────────┐
        │  Socket.io handlers  │  RoomManager(内存)  │  ContentStore(磁盘) │
        │  HTTP: /api/upload   │  TokenService       │  Static: /content/  │
        └──────────────────────────────────────────────────────────────┘
               ▲ 反向代理 + TLS                        ▲ 可选 STUN/TURN
        ┌──────┴───────┐                        ┌──────┴───────┐
        │    Nginx     │                        │    coturn    │(可选)
        └──────────────┘                        └──────────────┘
```

数据流分两条独立通道：
1. **控制/同步通道**（Socket.io）：房间状态、演示同步事件、权限指令、WebRTC 信令。
2. **媒体通道**（WebRTC P2P Mesh）：音频，端到端，不过服务器。

## 3. 目录结构

> 采用「核心(core) + 特性模块(features)」布局。特性模块之间**不互相 import**，只通过通信总线与共享状态交互（见 §13）。新增功能 = 新增一个 feature 模块，不改动核心与既有模块。

```
livepage/
├── client/                      # React 18 + Vite + antd
│   ├── src/
│   │   ├── main.jsx
│   │   ├── App.jsx              # 路由：/ 与 /room/:id
│   │   ├── core/               # 核心，特性模块只依赖它，它不依赖任何特性
│   │   │   ├── bus.js          # 客户端事件总线（发布/订阅）
│   │   │   ├── store.js        # 房间状态仓（各模块只写自己的切片）
│   │   │   ├── socket.js       # socket 单例 + 网络↔总线桥接
│   │   │   ├── events.js       # 事件名常量（网络 + 总线）
│   │   │   └── registry.js     # 特性模块注册器
│   │   ├── features/           # 每个特性自包含：UI + 逻辑 + 自己的事件
│   │   │   ├── sync/           # 演示同步
│   │   │   │   ├── index.js    # FeatureModule：init/dispose
│   │   │   │   ├── anchor.js   # 视口锚点算法
│   │   │   │   ├── selector.js # 稳定选择器
│   │   │   │   └── IframeStage.jsx
│   │   │   ├── voice/          # VoiceProvider.js / MeshProvider.js / VoiceControls.jsx
│   │   │   ├── participants/   # ParticipantList.jsx + 状态订阅
│   │   │   ├── content/        # 上传 UI + 内容切换
│   │   │   └── permission/     # 移交/拉回/静音 指令
│   │   └── pages/              # Home.jsx / Room.jsx（仅装配，不写业务）
│   └── vite.config.js
├── server/                      # Node.js + Socket.io
│   ├── src/
│   │   ├── index.js             # HTTP + Socket.io 启动 + 模块装配
│   │   ├── config.js
│   │   ├── core/
│   │   │   ├── bus.js           # 服务端事件总线
│   │   │   ├── socket-gateway.js# 网络事件↔总线桥接 + 权限校验
│   │   │   ├── events.js
│   │   │   └── registry.js      # 特性模块注册器
│   │   ├── features/            # 与前端对称
│   │   │   ├── room/            # 建房/加入/重连/生命周期
│   │   │   ├── sync/            # latestState + version 去乱序
│   │   │   ├── voice/           # WebRTC 信令中转 + 模式(free/ptt)
│   │   │   ├── content/         # 上传落盘/zip 解压/入口识别/同源托管
│   │   │   └── permission/      # 移交/拉回/静音
│   │   └── services/            # 无状态基础设施：room-manager, token, content-store
│   └── package.json
├── nginx/nginx.conf
├── coturn/turnserver.conf       # 可选
├── docker-compose.yml
└── data/bundles/{bundleId}/     # 运行期上传内容（gitignored）
```

## 4. 数据模型（服务端内存态）

```ts
Room {
  id: string                 // nanoid，不可枚举
  passwordHash: string       // 加盐哈希
  hostSessionId: string|null // null = 主持人离线，房间冻结不解散
  contentBundleId: string|null
  latestState: PresentationState
  participants: Map<sessionId, Participant>
  createdAt: number
  lastActiveAt: number       // 空房回收依据
}

Participant {
  sessionId: string          // 稳定身份，重连凭它恢复
  socketId: string           // 当前连接，重连会变
  name: string
  role: 'host' | 'guest'
  connected: boolean
  following: boolean         // 是否跟随主持人视角
  mic: boolean               // 是否开麦（PTT 模式下为「是否按住」）
  speaking: boolean          // VAD 或 PTT 状态，用于列表指示
}

PresentationState {
  contentBundleId: string|null
  currentPath: string        // 相对入口的页面路径（多页/hash）
  scrollAnchor: { selector: string, ratio: number } | null
  version: number            // 单调递增，用于丢弃乱序更新
  updatedAt: number
}

ContentBundle {              // 元信息，文件在磁盘 data/bundles/{id}/
  id: string
  entryFile: string          // 如 index.html
  sizeBytes: number
  uploadedBy: sessionId
  createdAt: number
}
```

**生命周期**：房间无人且 `lastActiveAt` 超过阈值（如 2h）→ 回收房间与其 bundle 目录。主持人离线不触发回收，仅冻结。

## 5. Socket.io 事件协议

- 传输：单一默认命名空间；用 socket.io room（`roomId`）做广播分组。
- 约定：请求-响应类用 ack 回调 `(payload, cb) => cb({ ok, data|error })`；广播类单向推送。
- 鉴权：`room:join` 成功后 socket 绑定 `sessionId` 与 `roomId`；此后主持人专属事件在服务端校验 `role==='host'`，非法直接 `error`。

### 5.1 客户端 → 服务端

| 事件 | payload | 权限 | 说明 |
|------|---------|------|------|
| `room:create` | `{ name, password }` | — | 建房，ack 返回 `{ roomId, token, sessionId }`，创建者即主持人 |
| `room:join` | `{ roomId, name, password?, token? }` | — | 校验密码或 token，ack 返回快照（见 §5.3） |
| `room:leave` | `{}` | 任意 | 主动离开 |
| `content:set` | `{ bundleId }` | host | 上传（HTTP）完成后切换当前演示内容 |
| `sync:state` | `{ scrollAnchor, currentPath, version }` | host | 视口/页面状态，节流上报 |
| `sync:click` | `{ selector, version }` | host | 点击/交互事件 |
| `follow:resume` | `{}` | guest | 回到主持人视角，服务端回发当前 `latestState` |
| `host:mute` | `{ target }` | host | 请求静音某成员（前端据此关麦） |
| `host:pullback` | `{ target \| 'all' }` | host | 把脱离者拉回 |
| `host:transfer` | `{ target }` | host | 移交主持权 |
| `webrtc:signal` | `{ to, data }` | 任意 | **mesh backend 独占**，服务端仅按 `to` 转发；换 SFU 后此事件消失 |
| `voice:update` | `{ mic, speaking }` | 任意 | 上报自身麦克风/说话状态 |

> 注：`follow:detach`（脱离）为纯前端状态，不需上报服务端；只有 `follow:resume` 需要服务端回发最新状态。

### 5.2 服务端 → 客户端

| 事件 | payload | 说明 |
|------|---------|------|
| `participant:joined` | `Participant` | 有人加入 |
| `participant:left` | `{ sessionId }` | 有人离开 |
| `participant:updated` | `Partial<Participant>` | 角色/跟随/麦克风/说话状态变化 |
| `sync:state` | `PresentationState` | 广播给**跟随中**的 guest |
| `sync:click` | `{ selector }` | 广播给跟随中的 guest |
| `content:changed` | `{ bundle: ContentBundle }` | 演示内容切换，全员重载 iframe |
| `host:changed` | `{ hostSessionId }` | 主持权变更，全员更新角色 UI |
| `follow:pullback` | `{}` | 定向下发，强制该 guest 回到跟随 |
| `webrtc:signal` | `{ from, data }` | **mesh backend 独占**，中转的信令 |
| `voice:mode` | `{ mode: 'free'\|'ptt', cap: 20 }` | 语音人数跨阈值时广播模式切换（provider 无关） |
| `error` | `{ code, message }` | 统一错误 |

### 5.3 加入快照（`room:join` 的 ack.data）

```ts
{
  sessionId, role,
  latestState: PresentationState,
  content: ContentBundle | null,
  participants: Participant[],
  voice: {                       // 由服务端 VoiceBackend.onJoin 产出，客户端据此选 Provider
    provider: 'mesh'|'livekit',  // 客户端动态实例化对应 VoiceProvider，不硬编码
    mode: 'free'|'ptt',
    cap: 20,
    count,
    config: { /* provider 专属：mesh→iceServers；livekit→token/url */ }
  }
}
```
新人拿到快照即可：重载 iframe 到 `content` + 定位 `latestState`，渲染成员列表，据 `voice.provider` 实例化语音层、据 `voice.mode` 决定发言方式。**这一条同时覆盖首次同步与断线补齐。**

## 6. 同步引擎（核心）

### 6.1 挂载方式
`IframeStage` 加载 `/content/{bundleId}/{entry}`（同源）。加载完成后，父页面通过 `iframe.contentWindow/contentDocument` 直接挂载监听（同源允许），**不改写用户上传的文件**。host 挂采集器，follower 挂应用器。

### 6.2 视口锚点算法（滚动）
抗分辨率/字号差异的关键：同步「哪个元素在视口顶部 + 进入多少」，而非绝对像素。

**采集（host）**，`scroll` 事件节流 ~50ms（trailing）：
```
candidates = 具备 data-sync-id 的元素，退化为块级元素(section/div/p/h*/li/img...)
topEl = 满足 rect.top <= 0 < rect.bottom 的最靠下的候选（即跨越视口顶线者）
ratio = (0 - rect.top) / rect.height          // 0..1，进入该元素的比例
上报 { selector: buildSelector(topEl), ratio }
```

**应用（follower）**：
```
el = resolveSelector(selector); if (!el) 退化为按文档比例滚动
targetTop = el.getBoundingClientRect().top + window.scrollY + ratio * el.offsetHeight
window.scrollTo({ top: targetTop })           // 不用 smooth，避免追帧抖动
```
应用期间设 `applying=true` 抑制自身 scroll 监听回环。

### 6.3 稳定选择器（`selector.js`）
生成优先级：
1. `#{id}`（校验唯一）
2. `[data-sync-id="..."]`
3. 逐级向上构造 `tag:nth-of-type(n)` 路径，遇到带 id 的祖先即锚定并停止；以 `body` 兜底。

解析：`document.querySelector(selector)`，命中失败返回 null 触发退化策略。**禁止使用绝对坐标或随机生成的运行时属性。**

### 6.4 点击/交互同步
- **host**：捕获阶段监听 `click`，记录 `buildSelector(e.target)` 上报；host 自身照常交互不拦截。
- **follower**：`resolveSelector` 后派发合成 `click`（`el.click()` 或 `dispatchEvent(new MouseEvent('click', {bubbles:true}))`）。
- **副作用防护**：跳过会触发外部导航的目标（`<a target=_blank>`、跨源 href）；表单提交默认不同步（MVP）。

### 6.5 页内导航
follower iframe 内发生 `hashchange`/整页跳转由 host 的 `sync:state.currentPath` 驱动：currentPath 变化时 follower 先重载对应页面再定位锚点。

### 6.6 去抖与乱序
- host 上报的每条 `sync:state` 带单调 `version`。
- 服务端仅当 `incoming.version > latestState.version` 才更新并广播，天然丢弃乱序/迟到包。
- follower 亦按 version 丢弃过期状态。

### 6.7 脱离/回归
- follower 在非 `applying` 期间检测到用户主动 scroll/click → 本地 `following=false`，显示 `DetachBanner`，并 `voice:update`/`participant:updated` 反映（可选）。
- 点「回到主持人视角」→ `follow:resume` → 服务端回发 `latestState` → 应用并 `following=true`。
- 主持人「拉回」→ 服务端向目标发 `follow:pullback` → 目标强制 `following=true` 并应用最新状态。

## 7. 语音层

> **架构原则**：mesh 几乎注定要被 SFU 取代（>20 人）。因此 §7.1~7.3 描述的是 **`MeshProvider` 的内部实现细节**，这些 mesh 特有概念（`RTCPeerConnection`、`webrtc:signal` 中转、Perfect Negotiation）**严禁泄漏到 core 或其他 feature**。语音对外只暴露 §7.4 的 Provider 抽象。切换到 LiveKit = 新增 `LiveKitProvider`/`LiveKitBackend` + 翻配置，其余代码零改动。

### 7.1 拓扑与信令（MeshProvider 内部）
全网状：N 个参会者两两建立 `RTCPeerConnection`，仅传音频。信令走 `webrtc:signal` 中转（该事件由 **mesh backend 独占**，见 §7.4）。采用 **Perfect Negotiation**（polite/impolite 角色）规避 glare：约定后加入者为 polite。

**建连流程（新成员 X 加入语音）**：
```
1. X 收到当前语音成员列表（含在 join 快照或 participant 列表）
2. 对每个已有成员 P：X 创建 RTCPeerConnection，addTrack(本地音频)
3. X(impolite) 发 offer → 经 webrtc:signal{to:P} 中转 → P 回 answer
4. 双方交换 ICE candidate（同样经中转）
5. ontrack 到达 → 挂到隐藏 <audio> 播放
```

### 7.2 ICE 配置（MeshProvider 内部）
```js
iceServers: [
  { urls: 'stun:stun.l.google.com:19302' },
  // 可选，来自 join 快照下发的 voice.config：
  // { urls: 'turn:host:3478', username, credential }
]
```
coturn 仅在部署配置存在时注入，兜底对称 NAT。

### 7.3 发言模式（PTT，MeshProvider 内部）
- 服务端按房间语音人数广播 `voice:mode`：`count <= 10` → `free`；`10 < count <= 20` → `ptt`；`count > 20` → 拒绝加入语音（`error`）。
- 前端实现：连接与音频 track 始终建立；**PTT 通过 `audioTrack.enabled = 按住 ? true : false`** 控制上行，不反复建拆连接（省去协商开销，PTT 只省带宽——见 PRD §5.5 备注）。
- 说话指示：`free` 模式用 Web Audio VAD 简单判定；`ptt` 模式即按键状态。经 `voice:update` 广播到列表。

### 7.4 语音抽象与 Provider 架构（mesh→SFU 迁移隔离）

耦合点有两处，**都必须被抽象隔离**：客户端的连接管理、服务端的信令/token 逻辑。故双侧各定义一个接口。

**(a) 客户端 `VoiceProvider`（传输无关，不暴露任何 WebRTC/SDP 细节）**
```ts
interface VoiceProvider {
  init(ctx: { bus, config }): void
  join(roomCtx: { roomId, sessionId, participants }): Promise<void>
  leave(): void
  setMuted(muted: boolean): void
  setPushToTalk(pressed: boolean): void      // free 模式下忽略
  dispose(): void
  // 产出统一经 bus 广播，其他模块只消费这些语义事件：
  //   voice:remote-stream { sessionId, stream }
  //   voice:remote-left   { sessionId }
  //   voice:speaking      { sessionId, speaking }
  //   voice:local-state   { muted, mode }
}
```
- `MeshProvider`：内部管理 N 个 PeerConnection、经注入的 `SignalingTransport` 收发 `webrtc:signal`。
- `LiveKitProvider`（v1.1）：内部用 LiveKit SDK 连一个 SFU，`setPushToTalk` 映射为 publish/unpublish 或 `track.enabled`。
- **关键**：`participants`/`permission`/`sync` 等模块只订阅 `voice:remote-stream` 等语义事件，永远看不到 `RTCPeerConnection`。换 provider 对它们透明。

**(b) 服务端 `VoiceBackend`（信令/接入的抽象）**
```ts
interface VoiceBackend {
  onJoin(room, participant): VoiceCaps      // 返回下发给该客户端的能力/配置
  onLeave(room, participant): void
  relay?(room, from, msg): void             // mesh 专用：中转 webrtc:signal
  mode(room): 'free' | 'ptt' | 'rejected'   // 由人数与 provider 能力决定
}
```
- `MeshBackend`：实现 `relay`（转发 `webrtc:signal`）、按人数算 `mode`、下发 STUN/TURN 配置。**`webrtc:signal` 事件仅注册在 mesh backend 上**——删除 mesh 时该网络事件随之消失，core 无残留。
- `LiveKitBackend`（v1.1）：`onJoin` 签发 LiveKit access token、配置 SFU room；无 `relay`（SFU 自带信令）；`mode` 可放宽到不限人数。

**(c) 配置握手（切换只是翻配置）**
- 环境变量 `VOICE_PROVIDER=mesh|livekit` 同时决定服务端 backend 与下发给客户端的 provider 选择。
- **客户端不硬编码 provider**：从 `room:join` 快照读取 `voice.provider` 字段动态实例化对应 Provider（见 §5.3）。这样切换无需改前端代码，甚至支持灰度。
- 网络信封的版本位（§13.2）保证新增 `voice.*` 字段对旧客户端前向兼容。

**(d) 迁移检查清单（切到 LiveKit 时需要动的全部内容）**
1. 新增 `client/features/voice/LiveKitProvider.js`；
2. 新增 `server/features/voice/LiveKitBackend.js`；
3. 部署加 LiveKit 服务，设 `VOICE_PROVIDER=livekit` 与相关密钥；
4. 放宽 `mode()` 的人数上限。

> core、sync、content、permission、participants、UI 装配层——**均无需改动**。这就是架构分离要保证的结果。

## 8. 上传与同源托管管线

### 8.1 上传接口（HTTP，非 socket）
`POST /api/rooms/:roomId/content`，`multipart/form-data`，鉴权用当前会话（主持人）。支持两种：
- 多文件：保留相对目录结构。
- 单个 `.zip`：服务端解压。

### 8.2 校验（`content-store.js` / `upload.js`）
- **总体积** ≤ 50MB（含 zip 解压后的累计大小，防 zip bomb）。
- **类型白名单**：`html htm css js mjs json png jpg jpeg gif svg webp woff woff2 ttf ico txt md`；非白名单拒绝。
- **zip slip 防护**：每个 entry 规范化路径后必须落在目标目录内（拒绝 `..`、绝对路径、符号链接）。
- **入口识别**：根目录 `index.html`；无则要求主持人指定 `entryFile`。

### 8.3 托管与安全头
静态服务 `GET /content/:bundleId/*`，同源返回，并对内容页附加：
```
Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline';
  object-src 'none'; base-uri 'none'; frame-ancestors 'self'
```
iframe 属性：`sandbox="allow-scripts allow-same-origin"`（同源以支持父页面注入监听；不含 `allow-top-navigation`/`allow-popups`）。

## 9. 权限、角色与重连

- **角色**：`host`（唯一）/ `guest`。主持人专属事件服务端强校验。
- **移交**：`host:transfer{target}` → 服务端将 `hostSessionId=target`，双方 `role` 更新，广播 `host:changed`；接收方获得 `latestState` 写权，原主持人降为 guest。
- **重连**：客户端持久化 `sessionId`（如 localStorage）。断线重连时 `room:join` 带原 `sessionId`；服务端匹配到离线记录则恢复其身份与角色（含 host），回发快照。主持人重连即恢复主持权与演示状态（目标 5s 内）。

## 10. 部署拓扑

```yaml
# docker-compose.yml（示意）
services:
  app:        # node server + 前端构建产物静态托管
    build: .
    environment: [ PORT, UPLOAD_MAX_MB=50, TOKEN_TTL_H=24, TURN_URL?, TURN_USER?, TURN_CRED? ]
    volumes: [ ./data:/app/data ]
  nginx:      # TLS 终止 + 反代 app + WebSocket 升级
    depends_on: [ app ]
    ports: [ "443:443", "80:80" ]
  coturn:     # 可选，仅在需要 TURN 时启用
    profiles: [ turn ]
    image: coturn/coturn
```
Nginx 需放行 WebSocket 升级（`Upgrade`/`Connection` 头）；WebRTC/麦克风要求 HTTPS。

## 13. 模块化与通信总线架构（扩展性基石）

功能将持续扩展（如未来的聊天、白板、表情、投票、录制）。为保持低耦合，确立以下架构约束，**从 M1 起就必须遵守**。

### 13.1 三条铁律
1. **特性模块之间零直接依赖**：`features/*` 互不 import，一律通过总线收发事件、通过状态仓读写各自切片。
2. **依赖单向**：`features → core`，`core` 永不依赖任何 feature（core 不得出现 `import ... from '../features/...'`）。
3. **模块自包含**：一个 feature 拥有自己的 UI、逻辑、网络事件、状态切片；新增功能 = 新增一个 feature 目录并注册，不改核心与既有模块。

### 13.2 通信总线（双层）

**层一：进程内事件总线**（客户端与服务端各一个，轻量 pub/sub，如 mitt 风格）
- 模块通过 `bus.emit(type, payload)` / `bus.on(type, handler)` 通信，不直接函数调用彼此。
- 事件命名空间化：`sync:*`、`voice:*`、`room:*`、`permission:*`、`content:*`，未来 `chat:*`、`board:*`。
- 例：content 模块切换内容后 `bus.emit('content:changed', bundle)`；sync 模块订阅它重载 iframe——两者互不知道对方存在。

**层二：网络总线**（Socket.io，跨端）
- 采用统一可扩展信封，未知 `type` 优雅忽略（前向兼容，新旧版本客户端共存不报错）：
  ```ts
  { type: string, v: number, payload: unknown }   // v = 事件 schema 版本
  ```
- `core/socket-gateway`（服务端）与 `core/socket.js`（客户端）是**唯二**桥接网络与进程内总线的地方：把入站网络事件翻译成总线事件、把需要外发的总线事件序列化上网。业务模块只跟进程内总线打交道，不直接碰 socket。

### 13.3 特性模块契约
每个 feature 导出统一接口，由 `core/registry` 装配：
```ts
interface FeatureModule {
  name: string
  init(ctx: { bus, store, config }): void   // 订阅总线、注册状态切片
  dispose?(): void                          // 清理订阅
  // 服务端额外可选：socketEvents?: Record<eventType, handler>  由 gateway 挂载
}
```
装配示例：`registry.use(syncModule, voiceModule, participantsModule, contentModule, permissionModule)`。加聊天功能时只需 `registry.use(chatModule)`。

### 13.4 状态仓切片
状态仓按 feature 分片；模块只写自己的片、可读他人片（只读订阅）。禁止跨模块直接改写他人切片——变更一律经总线事件驱动。

### 13.5 收益
- 新功能以「加模块」而非「改核心」的方式落地，回归风险局部化。
- 网络信封带版本 + 未知类型忽略，支持灰度与前向兼容。
- 语音层的 `VoiceProvider`（§7.4）正是该模式的一个实例：可替换实现不影响其他模块。

## 14. 技术决策日志

1. **父页面直接访问同源 iframe，不改写用户 HTML**：比向上传文件注入 `<script>` 更干净、无侵入，且规避改写破坏用户内容的风险。代价是必须同源托管（已是既定前提）。
2. **视口锚点 + 稳定选择器而非绝对坐标**：解决跨设备分辨率/字号差异导致的错位，是同步保真度的根本。
3. **单一 `latestState` + version 单调递增**：一套模型解决首次同步/断线补齐/重连，并天然处理乱序，避免三条独立代码路径。
4. **PTT 用 `track.enabled` 而非重建连接**：PTT 只需省带宽，连接常驻避免反复协商开销。
5. **语音双侧 Provider 抽象 + 配置握手**：mesh→SFU 是大概率必做项。客户端 `VoiceProvider` 只暴露语义事件（不露 `RTCPeerConnection`/SDP），服务端 `VoiceBackend` 隔离信令/token 逻辑，`webrtc:signal` 由 mesh backend 独占。客户端从 join 快照的 `voice.provider` 动态选实现。切换 = 加 `LiveKitProvider`/`LiveKitBackend` + 翻 `VOICE_PROVIDER` 配置，core 与其他模块零改动（见 §7.4 迁移清单）。
6. **内存态房间 + 磁盘 bundle**：MVP 无需数据库；房间是短生命周期会话态，落库是过度设计。
7. **通信总线 + 特性模块契约**：为持续扩展保持低耦合，新功能加模块而非改核心（见 §13）。

## 15. 已知限制

- **Mesh 硬上限 20 人**：连接数与发言者编码次数无法靠 PTT 缓解；>20 需 v1.1 LiveKit。
- **同步保真依赖 DOM 稳定性**：上传内容若在不同客户端渲染出结构性差异（如按视口宽度改变 DOM），选择器可能失配，退化为按比例滚动。
- **`allow-same-origin + allow-scripts` 的沙箱边界**：同源托管的内容能力较强，依赖 CSP 与类型/体积校验作为主要防线；不适合托管完全不可信的第三方内容。
- **合成点击无法覆盖所有交互**：拖拽、canvas、复杂 SPA 状态等超出「选择器点击」模型，MVP 不保证同步。
- **无持久化**：服务重启后进行中的房间与上传内容丢失（MVP 可接受）。
