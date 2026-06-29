# 📦 DeskBox

> 轻量级 Windows 桌面图标收纳工具 — 像手机文件夹一样整理桌面，热键一秒呼出。

![Platform](https://img.shields.io/badge/Platform-Windows_10%2F11-blue)
![Size](https://img.shields.io/badge/Size-6.5_MB-green)
[![Rust](https://img.shields.io/badge/Rust-1.96+-orange)](https://www.rust-lang.org/)
[![Tauri](https://img.shields.io/badge/Tauri-v2-7c8cf8)](https://v2.tauri.app/)
[![License](https://img.shields.io/badge/License-MIT-yellow)](LICENSE)

---

## ✨ 功能

### 核心操作
- 🔍 **桌面扫描** — 读取用户桌面 & 公共桌面的所有图标，解析 `.lnk` 目标路径、参数、工作目录、图标
- 📥 **收纳** — 右键图标 → 选择目标方块 → 文件移入本地存储；支持一键全部收纳
- ↩️ **还原** — 单个还原 / 单方块批量还原 / 全局还原；公共桌面图标自动弹出 UAC 提权
- 🚀 **启动应用** — 双击或 ▶ 按钮，通过 `ShellExecuteW` 传入目标路径 + 启动参数 + 工作目录

### 方块管理（手机风格）
- 📱 方块卡片展示 3×3 小图标预览，点击进入详情列表（图标 + 名称）
- ➕ 新建方块，可选 8 种颜色和 12 种 emoji 图标
- ✎ 方块名和图标名均可**直接点击编辑**，回车保存
- 🎨 方块内部「🎨 改色」按钮
- 🖱️ 方块卡片可拖拽排序；方块内图标可拖拽换位

### 界面与交互
- 🎨 **毛玻璃半透明** — `backdrop-filter: blur` + 圆角 + 阴影
- 🔲 **自定义标题栏** — 拖拽移动、最小化 `─`、隐藏 `✕`
- ⏱️ **呼出/隐藏动画** — 淡入淡出 + 微位移
- 📋 **右键菜单** — 打开、收纳、还原、删除、打开文件位置
- 🖥️ **系统图标控制** — 设置面板开关「此电脑/回收站/网络/控制面板」

### 系统集成
- ⌨️ **全局热键** — 默认 `Alt+Shift+D`，设置中可录制自定义组合键
- 📋 **系统托盘** — 左键显隐、右键菜单（显示/隐藏/设置/退出）
- 🚀 **开机自启** — 设置面板开关，直接调用 autostart 插件
- 🔝 **窗口置顶** — 开关即时生效
- 🔇 **静默启动** — 启动后隐藏到托盘，不弹窗打扰

---

## 🚀 快速开始

### 环境要求
- Windows 10/11
- [Rust](https://rustup.rs/) 1.96+
- [Node.js](https://nodejs.org/) 18+
- MSVC Build Tools 或 MinGW-w64

### 开发运行

```bash
cd deskbox
npm install
npm run tauri dev
```

### 构建 Release

```bash
npm run build                          # 前端 → frontend-dist/
cd src-tauri && cargo build --release  # 后端 → target/release/deskbox.exe (~6.5 MB)
```

> **注意：** 二进制需与 `WebView2Loader.dll` 同目录，前端文件在 `frontend-dist/`（由 Vite 输出）。

---

## 📖 使用指南

| 操作 | 方式 |
|------|------|
| 呼出/隐藏 | `Alt+Shift+D`（可自定义）或托盘左键 |
| 隐藏窗口 | `Esc` / 点击窗口外部 / 标题栏 `✕` |
| 最小化 | 标题栏 `─` |
| 退出 | 托盘右键 → 退出 |

### 收纳流程
1. 按热键呼出 → 切换到 **🖥 桌面** 视图
2. 右键图标 → 📥 收纳 → 选择目标方块
3. 或点 **📥 全部收纳** 一键处理

### 使用已收纳图标
1. **📦 方块** 视图 → 点击方块卡片
2. 双击图标（或点 ▶）→ 启动
3. 需要时点 ↩ 还原到桌面

---

## 🏗️ 技术栈

| 层 | 技术 |
|----|------|
| 框架 | Tauri v2 (custom-protocol) |
| 后端 | Rust + windows-rs 0.61 |
| 前端 | TypeScript + Vite + 原生 CSS |
| .lnk 解析 | IShellLinkW COM 接口 |
| 图标提取 | SHGetFileInfo + GDI → PNG base64 |
| 应用启动 | ShellExecuteW（路径 + 参数 + 工作目录） |
| 注册表 | RegOpenKeyExW / RegSetValueExW |
| 提权 | PowerShell Start-Process -Verb RunAs |
| 日志 | `%APPDATA%\DeskBox\deskbox.log` |

---

## 📁 项目结构

```
deskbox/
├── index.html
├── package.json / vite.config.ts / tsconfig.json
├── frontend-dist/                  # Vite 构建输出（永久目录）
├── src/
│   ├── main.ts                     # 前端主逻辑
│   └── styles/main.css             # 毛玻璃样式
├── src-tauri/
│   ├── Cargo.toml                  # Rust 依赖
│   ├── tauri.conf.json             # 窗口/托盘/热键/插件配置
│   ├── capabilities/default.json   # 权限声明
│   └── src/
│       ├── main.rs                 # 入口
│       ├── lib.rs                  # 窗口/托盘/热键/命令注册
│       ├── lnk.rs                  # .lnk/.url 解析 + 图标提取
│       ├── desktop.rs              # 桌面目录扫描
│       ├── storage.rs              # 文件收纳/还原
│       ├── config.rs               # JSON 配置读写
│       ├── commands.rs             # 全部 Tauri 命令
│       ├── system_icons.rs         # 注册表控制系统图标
│       └── logger.rs               # 文件日志
└── README.md
```

---

## 💾 数据存储

| 路径 | 内容 |
|------|------|
| `%APPDATA%\DeskBox\config.json` | 方块、物品、设置 |
| `%APPDATA%\DeskBox\storage\` | 收纳的文件实体 |
| `%APPDATA%\DeskBox\deskbox.log` | 运行日志 |

---

## 📊 性能

| 指标 | 数值 |
|------|------|
| 二进制大小 | **6.5 MB** |
| 空闲内存 | **~40 MB** |
| 冷启动 | **< 1s** |
| 热键响应 | **< 200ms** |

---

## ⚠️ 已知限制

- 公共桌面还原需 UAC 弹窗确认（已自动申请提权）
- 热键录制支持组合键，部分特殊键（媒体键等）暂不支持
- 文件夹收纳后子文件整体移动，还原时整体恢复
- 尚未实现单实例锁定，多开可能导致热键冲突

---

## 📝 常用命令

```bash
npm run tauri dev       # 开发模式
npm run build           # 构建前端
cargo build --release   # 构建 release 后端
```

日志查看：
```cmd
type %APPDATA%\DeskBox\deskbox.log
```

---

## 📄 许可证

MIT
