# Known Issues - oh-my-claude-webui

> Last updated: 2025-02-07

## Critical Issues

### 1. Chat Window - No Response Display

**Status**: Unresolved  
**Severity**: Critical

**Description**:
When sending a message in the Chat window, the UI shows "Thinking..." indefinitely but never displays the assistant's response.

**Symptoms**:
- User message appears correctly
- "Thinking..." indicator shows up
- Session ID updates correctly (CLI returns real session ID)
- Metadata (model, permission mode) displays correctly
- Token usage sometimes shows up
- **But assistant response text never appears**

**Console Errors**:
- `Server error: Invalid message format` appears occasionally
- Hydration mismatch errors (cosmetic, unrelated)

**Root Cause Analysis**:
- WebSocket connection works (status shows "Online")
- CLI process runs and returns response
- Issue likely in:
  1. `cli.ts` - `assistantMessage` event emission
  2. `index.ts` - WebSocket message forwarding
  3. `chat/page.tsx` - Message handling in `onmessage`

**Files Involved**:
- `apps/server/src/services/cli.ts`
- `apps/server/src/index.ts`
- `apps/web/app/chat/page.tsx`

---

### 2. Session Isolation - Messages Mixed Between Sessions

**Status**: Unresolved  
**Severity**: Critical

**Description**:
When switching between chat sessions (via sidebar or URL), messages from different sessions appear in the same chat window.

**Symptoms**:
- Open Session A, send message
- Switch to Session B (new chat)
- Messages from Session A still visible
- New messages get mixed with old ones

**Root Cause Analysis**:
- `messages` state is not cleared when session changes
- WebSocket connection may persist across session changes
- No proper session isolation in frontend state management

**Suggested Fix**:
```tsx
// In chat/page.tsx, when sessionId changes:
useEffect(() => {
  setMessages([])  // Clear messages when session changes
  setTokenUsage(null)
  setMetadata(null)
}, [sessionId])
```

**Files Involved**:
- `apps/web/app/chat/page.tsx`

---

### 3. History Integration - No Context Continuity

**Status**: Unresolved  
**Severity**: High

**Description**:
When opening a historical session from the History page:
1. History detail page shows the conversation correctly
2. Clicking "Continue Chat" opens Chat page
3. But Chat page doesn't display historical messages
4. CLI doesn't know about the conversation context

**Symptoms**:
- History page: Shows full conversation history (from transcript file)
- Chat page: Empty message list, starts fresh
- CLI: No `--resume` or context loading

**Root Cause Analysis**:
1. Chat page doesn't load historical messages from transcript
2. Need to fetch `/api/transcripts/:sessionId` on page load
3. Need to populate `messages` state from transcript data

**Suggested Fix**:
```tsx
// In chat/page.tsx, load history when resuming:
useEffect(() => {
  if (sessionId && sessionReady) {
    fetch(`http://localhost:5757/api/transcripts/${sessionId}`)
      .then(res => res.json())
      .then(data => {
        if (data.messages) {
          // Convert transcript format to Message format
          const historicalMessages = data.messages
            .filter(m => m.role === 'user' || m.role === 'assistant')
            .map(m => ({
              role: m.role,
              content: m.content,
              timestamp: m.timestamp
            }))
          setMessages(historicalMessages)
        }
      })
      .catch(err => console.log('No history found'))
  }
}, [sessionId, sessionReady])
```

**Files Involved**:
- `apps/web/app/chat/page.tsx`
- `apps/server/src/routes/transcripts.ts`

---

## Medium Priority Issues

### 4. React Hydration Mismatch

**Status**: Low priority  
**Severity**: Low (cosmetic)

**Description**:
Console shows hydration errors related to sidebar session links. This is because `generateUUID()` runs differently on server vs client.

**Fix**:
Move UUID generation to `useEffect` or use `suppressHydrationWarning`.

---

## Architecture Notes

### Current Flow (Broken)

```
User types message
    → Frontend sends via WebSocket { type: "message", content, sessionId }
    → Server receives, creates/gets CLIService instance
    → CLIService spawns `claude -p` with message
    → CLI returns stream-json output
    → CLIService parses output, emits 'assistantMessage' event
    → Server forwards to WebSocket
    → Frontend receives but DOESN'T DISPLAY (bug here)
```

### Session ID Flow

```
1. Frontend generates UUID (e.g., abc-123)
2. Sends first message with sessionId: abc-123
3. CLI creates new session, returns real ID (e.g., xyz-789)
4. Server emits 'sessionUpdate' with xyz-789
5. Frontend updates URL and sessionId state
6. Subsequent messages use xyz-789 with --resume flag
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

## Recent Changes (2025-02-07)

### Commits Made

1. `fix: sync frontend session ID with CLI-generated session ID`
   - Extract real session_id from CLI's init message
   - Emit sessionUpdate event when CLI returns different session ID
   - Use --resume flag with CLI's session ID for subsequent messages

2. `fix: prevent WebSocket recreation on session ID update`
   - Use sessionIdRef to track latest session ID
   - WebSocket useEffect only depends on sessionReady, not sessionId
   - Added error.tsx and global-error.tsx

### What Was Attempted

1. Session ID synchronization between frontend UUID and CLI-generated ID
2. Preventing WebSocket reconnection when session ID updates
3. Adding missing Next.js error boundary components

### What Didn't Work

- Assistant responses still don't display despite the fixes
- The root cause may be deeper in the message parsing/forwarding logic

---

## Next Steps

1. **Debug assistant message flow**:
   - Add detailed logging in `cli.ts` to verify `assistantMessage` is emitted
   - Add logging in `index.ts` to verify WebSocket sends the message
   - Add logging in `chat/page.tsx` to verify message is received

2. **Fix session isolation**:
   - Clear messages state when sessionId changes
   - Consider using a Map to store messages per session

3. **Implement history loading**:
   - Fetch transcript on Chat page load
   - Populate messages from transcript data

4. **Test with simpler model**:
   - Opus 4.5 Thinking takes 2+ minutes to respond
   - Test with faster model for quicker iteration
