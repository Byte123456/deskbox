# 📦 DeskBox v2

> 轻量级 Windows 桌面图标收纳工具 — 像手机文件夹一样整理桌面，热键一秒呼出。

![Platform](https://img.shields.io/badge/Platform-Windows_10%2F11-blue)
![Size](https://img.shields.io/badge/Size-7.5_MB-green)
[![Rust](https://img.shields.io/badge/Rust-1.96+-orange)](https://www.rust-lang.org/)
[![Tauri](https://img.shields.io/badge/Tauri-v2-7c8cf8)](https://v2.tauri.app/)
[![License](https://img.shields.io/badge/License-MIT-yellow)](LICENSE)

---

## ✨ 功能

### 核心操作
- 🔍 **桌面扫描** — 读取用户桌面 & 公共桌面的所有图标，解析 `.lnk` 目标路径、参数、工作目录、图标
- 📥 **收纳** — 右键图标 → 选择目标方块 → 文件移入本地存储；支持一键全部收纳
- 🤖 **自动整理** — 完全离线读取快捷方式目标与 EXE 产品名称、文件描述、公司名称，结合本地软件指纹库和多字段评分分类；只有高置信度项目会自动移动
- 🧠 **纠正记忆** — 手动选择方块或跨方块移动后，以软件身份 SHA-256 ID 永久记住选择；快捷方式改名后仍然有效
- 🛟 **不确定不移动** — 分数不足或两个分类接近时保留在桌面，并显示建议分类、备选分类及判断依据
- ↩️ **还原** — 单个还原 / 方块内拖到还原区域 / 单方块批量还原 / 全局还原；公共桌面自动 UAC 提权
- 🚀 **启动应用** — 双击或 ▶ 按钮，通过 `ShellExecuteW` 传入目标路径 + 启动参数 + 工作目录

### 方块管理
- 📱 方块卡片展示 3×3 小图标预览，点击进入详情列表
- ➕ 新建方块，可选 8 种颜色和 12 种 emoji 图标
- ✎ 方块名和图标名均可**直接点击编辑**，回车保存
- 🎨 「🎨 改色」按钮
- 🖱️ 方块卡片可拖拽排序；图标可拖拽换位
- 📋 **复制到** — 右键 → 复制图标到其他方块（物理文件也复制）
- 📤 **转移到** — 右键 → 移动图标到其他方块
- ↩ **拖拽还原** — 方块详情中拖拽图标到 `↩ 拖到这里还原` 区域即还原

### 回收站
- 🗑 **软删除** — 删除图标移入回收站而非永久销毁
- 方块视图顶部 🗑 按钮进入回收站
- 可逐个恢复、彻底删除，或一键清空

### 批量操作
- ☑ `Ctrl+点击` 切换选择 / `Shift+点击` 范围选择
- 选中后顶部出现批量工具栏：批量回收、批量还原

### 搜索
- 🔍 **始终可见搜索栏** — 输入即搜，支持中文拼音
- 方块视图 / 桌面视图 / 方块详情 / 回收站均可用
- `Esc` 清空搜索（有内容）或隐藏窗口

### 撤销 / 重做
- ↩️ `Ctrl+Z` 撤销，↪️ `Ctrl+Y` / `Ctrl+Shift+Z` 重做
- 最多 10 步历史，覆盖收纳/还原/重命名/复制/移动/全部收纳

### 备份 & 恢复 & 缓存
- 📤 **导出备份** — 设置面板 → 选择路径，ZIP 打包
- 📥 **导入备份** — 选择 ZIP 文件，自动恢复
- 🧹 **清理图标缓存** — 设置面板一键清除，释放磁盘空间

### 个性化
- 🌙 **主题切换** — 暗色 / 亮色 / 跟随系统，设置中切换即时生效
- 🎨 毛玻璃半透明 + 自定义标题栏 + 呼出动画

### 系统集成
- ⌨️ **全局热键** — 默认 `Alt+Shift+D`，可录制自定义组合键
- 📋 **系统托盘** — 左键显隐 / 右键菜单
- 🚀 **开机自启** / 🔝 **窗口置顶** / 🔇 **静默启动**
- 🔒 **单实例锁定** — 多开自动聚焦
- 🖥️ **系统图标控制** — 设置面板开关（此电脑/回收站/网络/控制面板）

---

## 🚀 快速开始

### 环境要求
- Windows 10/11
- [Rust](https://rustup.rs/) 1.96+
- [Node.js](https://nodejs.org/) 18+
- MSVC Build Tools 或 MinGW-w64

### 开发运行

```bash
cd deskbox-v2
npm install
npm run tauri dev
```

### 构建 Release

```bash
npm run build                          # 前端 → frontend-dist/
cd src-tauri && cargo build --release  # 后端 → target/release/deskbox.exe (~7.5 MB)
```

---

## 📖 使用指南

| 操作 | 方式 |
|------|------|
| 呼出/隐藏 | `Alt+Shift+D`（可自定义）或托盘左键 |
| 隐藏窗口 | `Esc` / 点击窗口外部 / 标题栏 `✕` |
| 最小化 | 标题栏 `─` |
| 退出 | 托盘右键 → 退出 |

### 收纳流程
1. 热键呼出 → **🖥 桌面** 视图
2. 右键图标 → 📥 收纳 → 选方块
3. 或点 **🤖 自动整理** 一键智能分类

### 使用收纳图标
1. **📦 方块** → 点击方块卡片
2. 双击图标启动，右键菜单：复制到/转移到/移入回收站
3. 拖拽图标到 `↩ 还原区域` 即还原到桌面

### 快捷键

| 快捷键 | 功能 |
|--------|------|
| `Ctrl+Z` | 撤销 |
| `Ctrl+Y` / `Ctrl+Shift+Z` | 重做 |
| `Esc` | 清空搜索 / 隐藏窗口 |
| `Ctrl+点击` | 多选图标 |
| `Shift+点击` | 范围选择图标 |

---

## 🏗️ 技术栈

| 层 | 技术 |
|----|------|
| 框架 | Tauri v2 (custom-protocol) |
| 后端 | Rust + windows-rs 0.62 |
| 前端 | TypeScript + Vite + 原生 CSS |
| .lnk 解析 | IShellLinkW COM |
| 图标提取 | SHGetFileInfo + GDI → PNG base64 |
| 拼音搜索 | pinyin-pro |
| 备份 | ZIP (deflate) |

---

## 📁 项目结构

```
deskbox-v2/
├── index.html
├── package.json / vite.config.ts / tsconfig.json
├── frontend-dist/
├── src/
│   ├── main.ts
│   ├── state.ts / types.ts / utils.ts
│   ├── actions/       (blocks / collect / drag-drop / items / undo)
│   ├── components/    (color-picker / context-menu / modal / search-bar)
│   ├── views/         (blocks-view / block-detail / desktop-view / settings-view / trash-view)
│   └── styles/main.css
├── src-tauri/
│   ├── Cargo.toml / tauri.conf.json
│   └── src/
│       ├── main.rs / lib.rs
│       ├── auto_organize.rs / backup.rs / commands.rs / config.rs
│       ├── desktop.rs / lnk.rs / logger.rs / storage.rs / system_icons.rs
└── README.md
```

---

## 💾 数据存储

| 路径 | 内容 |
|------|------|
| `%APPDATA%\DeskBox\config.json` | 方块、物品、回收站、整理规则、设置 |
| `%APPDATA%\DeskBox\storage\` | 收纳的文件 |
| `%APPDATA%\DeskBox\icon_cache\` | 图标缓存 |
| `%APPDATA%\DeskBox\deskbox.log` | 运行日志 |

---

## ⚠️ 已知限制

- 公共桌面还原需 UAC 确认（已自动提权）
- 特殊键（媒体键等）暂不支持热键录制
- 自定义整理规则需编辑 `config.json` 中的 `organize_rules` 字段

---

## 📄 许可证

MIT
