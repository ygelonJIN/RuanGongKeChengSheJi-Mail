# MailDesk - 现代化桌面邮件客户端

一款基于 Electron + React + TypeScript 构建的 Windows 桌面邮件客户端，支持多账号管理、智能规则引擎和实时通知。

## 功能特性

- **多账号支持**：同时管理 Gmail、Outlook、QQ邮箱、163邮箱、企业邮箱等
- **全协议支持**：IMAP 同步、SMTP 发送、OAuth2 授权
- **智能规则引擎**：基于条件自动分类、标记、移动邮件
- **实时通知**：IMAP IDLE 推送 + 桌面通知
- **本地全文搜索**：SQLite FTS5 中文全文索引，离线可用
- **统计仪表盘**：收件趋势、发件人排名、文件夹分布图表
- **三栏布局**：Outlook 风格，支持主题跟随

## 技术栈

| 层级 | 技术 |
|------|------|
| 桌面框架 | Electron 28 |
| 前端框架 | React 18 + TypeScript |
| 构建工具 | Vite + vite-plugin-electron |
| UI 组件 | Ant Design 5 |
| 状态管理 | Zustand |
| 图表 | Recharts |
| 数据库 | better-sqlite3 + FTS5 |
| 邮件协议 | nodemailer + imap |

## 项目结构

```
maildesk/
├── src/
│   ├── main/           # Electron 主进程
│   │   ├── index.ts    # 入口、窗口管理、菜单
│   │   ├── database/   # SQLite 数据库
│   │   ├── imap/      # IMAP 客户端 + 同步
│   │   ├── smtp/      # SMTP 发送
│   │   ├── rules/     # 规则引擎
│   │   ├── ipc/       # IPC 处理器
│   │   └── tray/      # 系统托盘
│   ├── renderer/       # React 渲染进程
│   │   ├── components/ # UI 组件
│   │   ├── stores/    # Zustand 状态
│   │   └── types/     # TypeScript 类型
│   └── preload/        # 预加载脚本（上下文桥接）
├── resources/          # 应用图标等资源
└── package.json
```

## 快速开始

### 环境要求

- Node.js >= 18
- npm >= 9
- Windows 10/11

### 安装依赖

```bash
cd maildesk
npm install
```

### 开发模式

```bash
npm run dev
```

### 构建安装包

```bash
npm run build
```

构建产物位于 `release/` 目录。

## 开发说明

### 数据库

SQLite 数据库位于 `%APPDATA%/MailDesk/maildesk.db`，首次启动时自动创建。

### 预置模板规则

- **周报识别**：主题含"周报" → 添加标签 + 桌面通知
- **发票识别**：主题含"发票" → 标记已读

### 快捷键

| 快捷键 | 功能 |
|--------|------|
| Ctrl+N | 新建邮件 |
| Ctrl+B | 切换侧边栏 |
| Ctrl+, | 打开设置 |
| Ctrl+Shift+R | 同步所有账户 |

## 许可证

MIT License
