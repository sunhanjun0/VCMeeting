# LivePage 🎙️

> 语音 + HTML演示 = 下一代轻量开源会议系统

LivePage 是一款**纯浏览器的开源会议系统**，核心理念是用**交互式HTML替代传统PPT**进行演示，配合**纯语音通话**完成远程分享和评审。

## ✨ 为什么选择 LivePage？

- 🎯 **交互式HTML演示** — 用代码、原型、图表替代死板的PPT
- 🎙️ **纯语音通话** — 砍掉视频流量，聚焦内容，弱网友好
- 🔗 **操作实时同步** — 主持人滚动/点击，参会者自动跟随
- 🚀 **零安装** — 打开浏览器即用，无需下载客户端
- 🐳 **轻量部署** — Docker Compose 一键启动，2核4G即可
- 🔓 **开源自由** — AGPLv3 许可证

## 🎬 典型场景

| 场景 | 用法 |
|------|------|
| 代码评审 | 加载代码高亮的HTML页面，语音讨论，同步滚动 |
| 技术分享 | 用 reveal.js 做交互式演示，现场运行代码示例 |
| 设计走查 | 加载交互原型HTML，边看边聊 |
| 远程培训 | 讲师操作演示页面，学员跟随观看 |

## 🏗️ 技术栈

| 层 | 技术 |
|----|------|
| 前端 | React 18 + Vite + Ant Design |
| 信令 | Node.js + Socket.io |
| 语音 | mediasoup (WebRTC SFU) |
| 部署 | Docker Compose + Nginx |

## 🚀 快速开始

### Docker 部署（推荐）

```bash
git clone https://github.com/your-org/livepage.git
cd livepage
docker compose up -d
# 打开 http://localhost
```

### 开发模式

```bash
# 启动后端
cd server
npm install
npm run dev

# 启动前端
cd client
npm install
npm run dev
```

## 📁 项目结构

```
livepage/
├── server/          # 信令服务器 + mediasoup SFU
│   ├── src/
│   │   ├── index.js           # 入口
│   │   ├── services/
│   │   │   ├── mediasoup.js   # SFU 管理
│   │   │   └── room-manager.js # 房间管理
│   │   └── socket/
│   │       └── handlers.js    # 信令处理
│   └── Dockerfile
├── client/          # React 前端
│   └── src/
│       ├── App.jsx
│       └── App.css
├── pocs/            # 技术验证
│   ├── mediasoup-poc/
│   └── iframe-sync-poc/
├── nginx/
│   └── nginx.conf
├── docker-compose.yml
└── README.md
```

## 📋 MVP 功能

- [x] 创建/加入会议（房间号机制）
- [x] 多人实时纯语音通话（mediasoup SFU）
- [x] HTML页面加载与同步演示（iframe + 事件广播）
- [x] 跟随/脱离浏览 + 一键回归
- [x] 主持人权限控制（静音、踢出、移交、拉回）
- [x] 参会者列表与状态指示
- [x] 主持人离线 → 会议保留，随时重连
- [x] Docker Compose 一键部署

## 📖 文档

- [需求概要](./LivePage_需求概要.md)
- [MVP PRD](./LivePage_MVP_PRD.md)
- [评审材料](./LivePage_评审材料.md)
- [技术验证报告](./LivePage_技术验证报告.md)

## 📜 许可证

[AGPLv3](./LICENSE)

---

Made with ❤️ by the LivePage community
