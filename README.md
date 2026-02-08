# Oh My Claude WebUI 🚀

一个基于 [Claude Code CLI](https://docs.anthropic.com/en/docs/agents-and-tools/claude-code/overview) 的现代化桌面 GUI 客户端。

> **解决了 Windows 下 Claude CLI 的文件锁痛点，提供 IDE 级的项目管理和历史回溯体验。**

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Build](https://img.shields.io/badge/build-passing-brightgreen.svg)

## ✨ 核心特性

### 🧠 无缝对话体验 (Stateless Context Injection)
- **彻底解决文件锁**：不再依赖 CLI 脆弱的 `--session-id` 锁定机制。我们采用了创新的 **History Injection** 技术，每次对话都将完整的历史记录注入给无状态的 CLI 进程。
- **永不失忆**：无论何时通过侧边栏点击历史会话，Claude 都能完美接上之前的上下文，就像从未中断过一样。
- **自动恢复**：遇到进程冲突时，系统会自动进行 ID 迁移，确保对话不中断。

### 📂 项目导向管理 (Project-Oriented)
- **按项目分组**：自动扫描 `~/.claude/projects/`，将散乱的会话按所属项目文件夹自动分组。
- **文件浏览器**：右侧集成文件树，实时展示当前项目的文件结构。点击文件即可自动填入 `/read` 命令。
- **智能路径解析**：完美处理 Windows 下复杂的路径编码（如 `E--Vibe-Coding...`）。

### 🔍 全文检索 (Full-Text Search)
- **毫秒级搜索**：不仅仅搜索会话标题，更能深入所有历史对话的内容进行**全文检索**。
- **快速跳转**：搜索关键词（如 "OpenClaw"），立刻定位到包含该话题的历史会话。

### 🎨 现代化 UI/UX
- **Thinking Indicator**：实时展示 Claude 的思考过程、工具调用状态（读取文件、执行命令）。
- **侧边栏 (Sidebar)**：集成“最近会话”、“项目列表”和“全局搜索”。
- **Markdown 渲染**：完美支持代码高亮、Artifacts 预览。

---

## 🛠️ 技术栈

- **Frontend**: Next.js 15 (App Router), Tailwind CSS, Lucide Icons, Shadcn/UI
- **Backend**: Hono (running on Bun), WebSocket
- **Runtime**: Bun (Fast & All-in-one)
- **Core**: Claude Code CLI (Official)

---

## 🚀 快速开始

### 前置要求
- Windows / macOS / Linux
- [Bun](https://bun.sh/) (推荐) 或 Node.js 20+
- 已安装并登录 [Claude Code CLI](https://docs.anthropic.com/en/docs/agents-and-tools/claude-code/overview) (`npm i -g @anthropic-ai/claude-code` 然后 `claude login`)

### 安装运行

1. **克隆仓库**
   ```bash
   git clone https://github.com/sundoubleday/oh-my-claude-webui.git
   cd oh-my-claude-webui
   ```

2. **安装依赖**
   ```bash
   bun install
   ```

3. **启动服务 (前后端同时启动)**
   ```bash
   # 启动后端 (API & WebSocket on 5757)
   cd apps/server && bun run dev

   # 新开终端，启动前端 (Next.js on 3000)
   cd apps/web && bun run dev
   ```

4. **访问**
   打开浏览器访问 `http://localhost:3000`

---

## 💡 常见问题

**Q: 为什么不需要 `--session-id`？**
A: 在 `-p` (print) 模式下，Claude CLI 默认是不保存状态的。我们通过前端维护 `messages` 数组，并在每次请求时将历史记录封装成 XML Prompt 发送给 CLI，从而实现了比官方 `--session-id` 更稳定、更灵活的上下文管理。

**Q: Windows 下提示端口占用？**
A: 请使用以下命令清理残留进程：
```powershell
Stop-Process -Name node,bun -Force -ErrorAction SilentlyContinue
```

---

## 🤝 贡献

欢迎提交 PR 或 Issue！让我们一起打造最强的 Claude 桌面客户端。

## 📄 开源协议

MIT License
