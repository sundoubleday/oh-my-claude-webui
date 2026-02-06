# oh-my-claude-webui

A local web UI for Claude Code.

## Features
- Visual configuration management (MCP, Skills, Plugins)
- Chat interface with session management
- History browsing
- Custom commands

## Prerequisites
- [Bun](https://bun.sh/)
- Claude CLI installed and configured

## Installation
```bash
bun install
```

## Usage
```bash
bun run dev
```

## Tech Stack
- **Frontend**: Next.js 15 + Shadcn/ui + Tailwind CSS
- **Backend**: Bun + Hono + WebSocket
- **Testing**: Vitest + Playwright
- **Shared**: Monorepo structure with shared types/logic

## Project Structure
- `apps/web`: Next.js frontend application
- `apps/server`: Hono backend server for Claude CLI interaction
- `packages/shared`: Common types and utilities used by both web and server
- `tests/e2e`: Playwright end-to-end tests

## Development
To start both the frontend and backend in development mode:
```bash
bun run dev
```

To run tests:
```bash
# Unit tests
bun run test

# E2E tests
bun run test:e2e
```

## Known Issues/Limitations
- Requires Claude CLI to be authenticated.
- Currently optimized for local execution.
