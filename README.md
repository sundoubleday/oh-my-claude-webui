# Oh My Claude - Desktop GUI for Claude Code

A local web UI and desktop application for Claude Code CLI.

## Features

- ✅ Chat with Claude Code CLI
- ✅ Session management and history
- ✅ Visual configuration (MCP, Skills, Plugins)
- ✅ Token usage tracking
- ✅ Model and permission mode display
- ✅ Custom commands
- ✅ **Electron desktop app** (Windows/macOS/Linux)

## Prerequisites

- [Bun](https://bun.sh/) - JavaScript runtime
- [Claude CLI](https://www.anthropic.com/claude-code) - Must be installed and configured

## Installation

```bash
bun install
```

## Usage

### Web Mode (Development)

Start both frontend and backend:
```bash
bun run dev
```
Then open http://localhost:3000

### Electron Desktop App

**Development mode:**
```bash
bun run dev:electron
```

**Build desktop app (Windows .exe):**
```bash
bun run electron:dist
```

The installer will be in the `release` directory.

## Project Structure

```
oh-my-claude-webui/
├── apps/
│   ├── web/           # Next.js 15 frontend
│   └── server/        # Hono + Bun backend
├── electron/
│   ├── main.ts        # Electron main process
│   └── preload.ts     # Preload script
├── packages/
│   └── shared/        # Shared types and utilities
├── build/             # Icons and build resources
└── release/           # Built installers
```

## Tech Stack

- **Frontend**: Next.js 15 + Shadcn/ui + Tailwind CSS
- **Backend**: Bun + Hono + WebSocket
- **Desktop**: Electron 31
- **Testing**: Vitest + Playwright

## Scripts

| Command | Description |
|---------|-------------|
| `bun run dev` | Start web development servers |
| `bun run dev:electron` | Start Electron development mode |
| `bun run build` | Build web assets |
| `bun run electron:dist` | Build Electron installer |
| `bun run test` | Run unit tests |
| `bun run test:e2e` | Run E2E tests |

## Troubleshooting

### Claude CLI not found

Make sure Claude CLI is installed globally:
```bash
npm install -g @anthropic-ai/claude-code
```

### Port already in use

Default ports: 3000 (frontend), 5757 (backend)

### Electron build errors

```bash
bun run postinstall
```

## Known Issues

See [KNOWN_ISSUES.md](./KNOWN_ISSUES.md) for current issues and fixes.

## License

MIT
