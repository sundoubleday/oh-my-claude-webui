# Known Issues - oh-my-claude-webui

> Last updated: 2025-02-07

## ✅ Fixed Issues

### 1. Chat Window - No Response Display (FIXED)

**Status**: ✅ Fixed  
**Severity**: Critical

**What was wrong**:
- CLI path was hardcoded to single location
- Message extraction logic was incomplete
- WebSocket message format was inconsistent

**Fixes applied**:
1. Added `findClaudeCliJs()` function that checks multiple locations (npm, bun, pnpm, local)
2. Improved `extractAssistantContent()` to handle both `assistant` and `result` message types
3. Added detailed logging throughout the message flow
4. Fixed WebSocket message format to send content as string directly

**Files changed**:
- `apps/server/src/services/cli.ts`
- `apps/server/src/index.ts`
- `apps/web/app/chat/page.tsx`

---

### 2. Session Isolation - Messages Mixed Between Sessions (FIXED)

**Status**: ✅ Fixed  
**Severity**: Critical

**What was wrong**:
- State wasn't always cleared when switching sessions
- New sessions didn't properly initialize clean state

**Fixes applied**:
1. Added explicit state clearing for new sessions (messages, tokenUsage, metadata, processingStatus)
2. Added logging for session changes
3. Ensured all session-related state is reset on session change

**Files changed**:
- `apps/web/app/chat/page.tsx`

---

### 3. History Integration - No Context Continuity (FIXED)

**Status**: ✅ Fixed  
**Severity**: High

**What was wrong**:
- History loading failed silently
- No logging to debug issues

**Fixes applied**:
1. Added detailed logging for history loading process
2. Improved error handling with meaningful error messages
3. Added session type detection (existing vs new)

**Files changed**:
- `apps/web/app/chat/page.tsx`

---

### 4. React Hydration Mismatch (FIXED)

**Status**: ✅ Fixed  
**Severity**: Low (cosmetic)

**What was wrong**:
- UUID generation in sidebar caused hydration mismatch

**Fixes applied**:
- Sidebar now uses stable URL `/chat?session=new` (already implemented)
- UUID generation only happens client-side in chat page

**Files changed**:
- `apps/web/app/chat/page.tsx`

---

## Architecture Notes

### Current Flow (Fixed)

```
User types message
    → Frontend sends via WebSocket { type: "message", content, sessionId }
    → Server receives, creates/gets CLIService instance
    → CLIService spawns `node cli.js -p` with message
    → CLI returns stream-json output
    → CLIService parses output, emits 'assistantMessage' event
    → Server forwards via WebSocket { type: "message", content: "..." }
    → Frontend receives and displays message ✅
```

### Session ID Flow

```
1. Frontend generates UUID (e.g., abc-123) or uses 'new' keyword
2. Sends first message with sessionId: abc-123
3. CLI creates new session, returns real ID (e.g., ses_xyz789)
4. Server emits 'sessionUpdate' with ses_xyz789
5. Frontend updates URL and sessionId state
6. Subsequent messages use ses_xyz789 with --resume flag
```

### Key Files

| File | Purpose |
|------|---------|
| `apps/web/app/chat/page.tsx` | Chat UI, WebSocket client, message display |
| `apps/server/src/index.ts` | WebSocket server, CLI instance management |
| `apps/server/src/services/cli.ts` | Claude CLI wrapper, stream-json parsing |
| `apps/server/src/routes/transcripts.ts` | History API endpoints |
| `apps/web/app/history/page.tsx` | History list and detail views |

---

## CLI Path Discovery

The CLI service now checks multiple locations for Claude CLI:

1. `%USERPROFILE%\AppData\Roaming\npm\node_modules\@anthropic-ai\claude-code\cli.js` (npm global)
2. `%USERPROFILE%\.npm-global\lib\node_modules\@anthropic-ai\claude-code\cli.js` (npm custom global)
3. `%USERPROFILE%\.bun\install\global\node_modules\@anthropic-ai\claude-code\cli.js` (bun global)
4. `%USERPROFILE%\AppData\Local\pnpm\global\5\node_modules\@anthropic-ai\claude-code\cli.js` (pnpm global)
5. `{cwd}\node_modules\@anthropic-ai\claude-code\cli.js` (local project)

---

## Debugging Tips

### Check Console Logs

Server-side logs (in terminal running `bun run dev`):
- `[CLIService] Found Claude CLI at: ...` - CLI path discovery
- `[CLIService] Processing message type: ...` - Message parsing
- `[CLIService] ✅ Emitting assistantMessage event` - Success
- `[CLIService] ⚠️ No assistant text found` - Problem

Client-side logs (in browser DevTools):
- `[Chat] Received assistant message: ...` - Message received
- `[Chat] ✅ Adding assistant message` - Message added to UI
- `[Chat] Session changed, clearing state` - Session isolation

### Common Issues

1. **No response**: Check if CLI path is found in server logs
2. **Messages mixed**: Verify session ID changes are logged
3. **History not loading**: Check network tab for `/api/transcripts/` requests

---

## Next Steps (Feature Additions)

After bugs are fixed, consider adding features from CodePilot (Mac version):

1. **SQLite Database** - Persistent message storage
2. **File Tree Panel** - Show project structure
3. **MCP Server Management** - Visual editor for MCP config
4. **Skills Editor** - Create and edit custom skills
5. **Permission System** - Approve/reject tool calls
6. **Model Selector** - Switch between Opus/Sonnet/Haiku
7. **Mode Selector** - Code/Plan/Ask modes
8. **Electron Packaging** - Desktop application
