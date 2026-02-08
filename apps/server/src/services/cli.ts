import { EventEmitter } from 'events'
import { randomUUID } from 'crypto'
import { homedir } from 'os'
import { join } from 'path'
import { existsSync } from 'fs'

// Windows: claude.cmd wraps node + cli.js, but spawn can't capture output from .cmd
// Solution: Call node directly with cli.js path
// Try multiple possible locations
function findClaudeCliJs(): string {
  const home = homedir()
  const candidates = [
    // npm global install (Windows)
    join(home, 'AppData', 'Roaming', 'npm', 'node_modules', '@anthropic-ai', 'claude-code', 'cli.js'),
    // npm global install (alternative)
    join(home, '.npm-global', 'lib', 'node_modules', '@anthropic-ai', 'claude-code', 'cli.js'),
    // Bun global install
    join(home, '.bun', 'install', 'global', 'node_modules', '@anthropic-ai', 'claude-code', 'cli.js'),
    // pnpm global install
    join(home, 'AppData', 'Local', 'pnpm', 'global', '5', 'node_modules', '@anthropic-ai', 'claude-code', 'cli.js'),
    // Local project install
    join(process.cwd(), 'node_modules', '@anthropic-ai', 'claude-code', 'cli.js'),
  ]
  
  for (const path of candidates) {
    if (existsSync(path)) {
      console.log('[CLIService] Found Claude CLI at:', path)
      return path
    }
  }
  
  // Fallback to default npm path
  const defaultPath = candidates[0]
  console.warn('[CLIService] Claude CLI not found at any expected location, using default:', defaultPath)
  return defaultPath
}

const CLAUDE_CLI_JS = findClaudeCliJs()

/**
 * Convert encoded project directory name to real filesystem path
 * Encoding rules:
 * - C:\Users\zht19 -> C--Users-zht19
 * - E:\Vibe Coding\project -> E--Vibe-Coding-project
 * - Drive letter followed by :\ becomes --
 * - All subsequent \ and spaces become -
 */
function projectDirToRealPath(projectDir: string): string | null {
  const match = projectDir.match(/^([A-Za-z])--(.+)$/)
  if (!match) {
    console.log('[CLIService] projectDirToRealPath: No drive letter pattern found in:', projectDir)
    return null
  }
  
  const driveLetter = match[1].toUpperCase()
  const encodedPath = match[2]
  const parts = encodedPath.split('-')
  let currentPath = `${driveLetter}:\\`
  
  for (let i = 0; i < parts.length; i++) {
    let found = false
    
    // Try to find the longest valid sub-path by peeking ahead
    // We try both spaces and dashes as separators because both are encoded as '-'
    for (let j = parts.length; j > i; j--) {
      const subParts = parts.slice(i, j)
      
      // Try with space (e.g., "Vibe Coding")
      const withSpace = subParts.join(' ')
      const pathWithSpace = join(currentPath, withSpace)
      if (existsSync(pathWithSpace)) {
        currentPath = pathWithSpace
        i = j - 1
        found = true
        break
      }
      
      // Try with dash (e.g., "oh-my-claude-webui")
      const withDash = subParts.join('-')
      const pathWithDash = join(currentPath, withDash)
      if (existsSync(pathWithDash)) {
        currentPath = pathWithDash
        i = j - 1
        found = true
        break
      }
    }
    
    if (!found) {
      // Fallback: just append the next part
      currentPath = join(currentPath, parts[i])
    }
  }
  
  return existsSync(currentPath) ? currentPath : null
}

/**
 * Find the project directory name that contains a given session ID
 * Returns the encoded project directory name (e.g., "C--Users-zht19")
 */
function findSessionProjectDir(sessionId: string): string | null {
  const projectsDir = join(homedir(), '.claude', 'projects')
  
  if (!existsSync(projectsDir)) {
    return null
  }
  
  try {
    const { readdirSync, statSync } = require('fs')
    const entries = readdirSync(projectsDir)
    
    for (const entry of entries) {
      try {
        const entryPath = join(projectsDir, entry)
        if (!statSync(entryPath).isDirectory()) continue
        
        const sessionFile = join(entryPath, `${sessionId}.jsonl`)
        if (existsSync(sessionFile)) {
          console.log('[CLIService] Found session in project dir:', entry)
          return entry
        }
      } catch {
        // Skip invalid entries
      }
    }
  } catch (error) {
    console.error('[CLIService] Error searching for session project:', error)
  }
  
  return null
}

// Check if a session already exists (search in projects directory)
// Sessions are stored in ~/.claude/projects/<project-dir>/<session-id>.jsonl
function sessionExists(sessionId: string): boolean {
  const projectsDir = join(homedir(), '.claude', 'projects')
  
  if (!existsSync(projectsDir)) {
    return false
  }
  
  try {
    // Synchronously search all project directories for the session file
    const { readdirSync, statSync } = require('fs')
    const entries = readdirSync(projectsDir)
    
    for (const entry of entries) {
      try {
        const entryPath = join(projectsDir, entry)
        if (!statSync(entryPath).isDirectory()) continue
        
        const sessionFile = join(entryPath, `${sessionId}.jsonl`)
        if (existsSync(sessionFile)) {
          console.log('[CLIService] Found existing session at:', sessionFile)
          return true
        }
      } catch {
        // Skip invalid entries
      }
    }
  } catch (error) {
    console.error('[CLIService] Error searching for session:', error)
  }
  
  return false
}

export class CLIServiceError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CLIServiceError'
  }
}

export interface CLIServiceOptions {
  /** Response timeout in milliseconds (default: 120000) */
  timeoutMs?: number
}

export interface CLIMessage {
  type: string
  subtype?: string
  result?: string
  message?: {
    role?: string
    content?: string | Array<{ type: string; text?: string }>
  }
  [key: string]: unknown
}

/** Session metadata from CLI init message */
export interface SessionMetadata {
  sessionId: string  // Real session ID from CLI
  model: string
  permissionMode: string
  claudeCodeVersion: string
  slashCommands: string[]
  skills: string[]
  agents: string[]
}

/** Token usage from CLI result message */
export interface TokenUsage {
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheCreationTokens: number
  totalCostUsd: number
}

export interface CLIServiceEvents {
  ready: () => void
  init: (metadata: SessionMetadata) => void
  sessionUpdate: (sessionId: string) => void  // Real CLI session ID
  message: (msg: CLIMessage) => void
  assistantMessage: (content: string) => void
  tokenUsage: (usage: TokenUsage) => void
  raw: (line: string) => void
  error: (error: string) => void
  exit: (code: number | null) => void
  timeout: () => void
  processing: (isProcessing: boolean) => void
}

/**
 * CLIService - Manages Claude CLI process lifecycle
 * 
 * Uses stream-json format to get rich metadata (model, mode, commands, token usage).
 * Spawns a new process for each message with --session-id for context.
 * 
 * IMPORTANT: Uses Bun.spawn instead of child_process.spawn for proper
 * stdout capture on Windows.
 * 
 * Events:
 * - ready: Service initialized
 * - init: Session metadata received (model, mode, commands)
 * - message: Raw parsed JSON message from stdout
 * - assistantMessage: Extracted assistant response text
 * - tokenUsage: Token usage statistics
 * - raw: Non-JSON line from stdout
 * - error: stderr output or error message
 * - exit: Process exited
 * - timeout: No response within timeout period
 * - processing: Processing state changed
 */
export class CLIService extends EventEmitter {
  private sessionId: string | null = null
  private timeoutMs: number
  private isProcessing: boolean = false
  private metadata: SessionMetadata | null = null
  private sessionCreated: boolean = false  // Track if session was already created
  private customCwd: string | null = null  // Custom working directory

  constructor(options: CLIServiceOptions = {}) {
    super()
    this.timeoutMs = options.timeoutMs ?? 120000 // 2 minutes default
    
    // Add default error handler to prevent crashes
    this.on('error', (err) => {
      console.error('[CLIService] Internal Error:', err)
    })
  }

  /**
   * Initialize the CLI service with a session ID and optional project path
   * @param sessionId - Optional session ID (UUID format). Auto-generated if not provided.
   * @param cwd - Optional project directory path.
   */
  async start(sessionId?: string, cwd?: string): Promise<void> {
    this.sessionId = sessionId || randomUUID()
    if (cwd) {
      this.customCwd = cwd
      console.log('[CLIService] Custom CWD set:', cwd)
    }
    this.emit('ready')
  }

  /**
   * Parse stream-json output (one JSON object per line)
   */
  private parseStreamJson(output: string): CLIMessage[] {
    const messages: CLIMessage[] = []
    const lines = output.split('\n').filter(line => line.trim())
    
    for (const line of lines) {
      try {
        const msg = JSON.parse(line) as CLIMessage
        messages.push(msg)
      } catch {
        // Skip non-JSON lines
        console.log('[CLIService] Skipping non-JSON line:', line.substring(0, 50))
      }
    }
    
    return messages
  }

  /**
   * Extract text content from assistant message
   */
  private extractAssistantContent(msg: CLIMessage): string | null {
    // Handle assistant type messages
    if (msg.type === 'assistant') {
      // Direct content field
      if (typeof msg.content === 'string') {
        return msg.content
      }
      
      // Message object with content
      if (msg.message) {
        const content = msg.message.content
        if (typeof content === 'string') return content
        
        // Handle array of content blocks
        if (Array.isArray(content)) {
          const text = content
            .filter(block => block.type === 'text' && block.text)
            .map(block => block.text)
            .join('\n')
          return text || null
        }
      }
    }
    
    // Handle result type messages (final response)
    if (msg.type === 'result' && msg.result) {
      return typeof msg.result === 'string' ? msg.result : null
    }
    
    return null
  }

  /**
   * Send a message to the Claude CLI using stream-json format
   * @param content - Message content to send
   * @param attachments - Optional file attachments
   * @param history - Optional conversation history for context injection
   */
  async sendMessage(content: string, attachments: any[] = [], history: any[] = []): Promise<void> {
    if (!this.sessionId) {
      throw new CLIServiceError('Service not started. Call start() first.')
    }

    if (this.isProcessing) {
      throw new CLIServiceError('Previous message still processing. Please wait.')
    }

    this.isProcessing = true
    this.emit('processing', true)

    try {
      console.log('[CLIService] Spawning with Bun.spawn (stream-json)...')
      
      let finalContent = content
      
      // Inject history if available (Context Rehydration)
      if (history && history.length > 0) {
        // Use standard "User: ... \n\nAssistant: ..." format which is more robust for CLI
        const historyBlock = history
          .map((msg: any) => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`)
          .join('\n\n')
        
        // Simple and direct context injection
        const contextPrompt = `Here is the conversation history so far:\n\n${historyBlock}\n\nUser: ${content}`
        finalContent = contextPrompt
      } else {
        // No history, just the content
        finalContent = content
      }
      
      console.log('[CLIService] Sending prompt length:', finalContent.length)
      // DEBUG: Log prompt preview
      console.log('[CLIService] Prompt preview:', finalContent.substring(0, 100) + '...')
      
      // Process attachments
      if (attachments && attachments.length > 0) {
        const { writeFileSync, mkdirSync } = require('fs')
        const { join } = require('path')
        const tempDir = join(process.cwd(), 'temp', this.sessionId)
        if (!existsSync(tempDir)) mkdirSync(tempDir, { recursive: true })

        const attachmentPrompts: string[] = []
        
        for (const attachment of attachments) {
          const filePath = join(tempDir, attachment.name)
          if (attachment.data) {
            // Write base64 image data to file
            writeFileSync(filePath, Buffer.from(attachment.data, 'base64'))
            attachmentPrompts.push(`[Attached Image: ${filePath}]`)
          }
        }
        
        if (attachmentPrompts.length > 0) {
          // If content is empty, add a default prompt to avoid CLI getting stuck
          const userPrompt = content.trim() || "Please analyze the attached image(s)."
          finalContent = `${attachmentPrompts.join('\n')}\n\n${userPrompt}`
        }
      }

        // Build command args
        const args = [
          'node',
          CLAUDE_CLI_JS,
          '-p', finalContent,
          '--output-format', 'stream-json',
          '--verbose',
          '--no-session-persistence' // CRITICAL: Disable internal persistence to avoid file locks. We rely on history injection.
        ]
        
        // Determine the working directory for the CLI
        let cwd = this.customCwd || homedir()
        
        // PRECISE SESSION RESUME LOGIC
        // We use --resume with --fork-session to safely load history without locking the old file
        if (this.sessionId && (this.sessionCreated || sessionExists(this.sessionId))) {
          const projectDir = findSessionProjectDir(this.sessionId)
          if (projectDir) {
            const realPath = projectDirToRealPath(projectDir)
            if (realPath) {
              console.log('[CLIService] Resuming & Forking session:', this.sessionId, 'in cwd:', realPath)
              cwd = realPath
              args.push('--resume', this.sessionId)
              args.push('--fork-session') // CRITICAL: This allows reading old history without locking it!
            }
          }
        }
      
        // Build environment variables for the CLI
        const sdkEnv: Record<string, string> = { ...(process.env as Record<string, string>) }
        const home = homedir()
        sdkEnv.HOME = home
        sdkEnv.USERPROFILE = home
        sdkEnv.APPDATA = process.env.APPDATA || join(home, 'AppData', 'Roaming')
        sdkEnv.LOCALAPPDATA = process.env.LOCALAPPDATA || join(home, 'AppData', 'Local')
        
        // Ensure PATH is preserved (handle both Path and PATH cases)
        const pathKey = Object.keys(process.env).find(k => k.toUpperCase() === 'PATH') || 'Path'
        if (process.env[pathKey]) {
          sdkEnv[pathKey] = process.env[pathKey] as string
        }
        
        console.log('[CLIService] Spawning in:', cwd)
        
        // Spawn CLI process
      const proc = Bun.spawn(args, {
        stdout: 'pipe',
        stderr: 'pipe',
        cwd: cwd,
        env: sdkEnv,
      })

      // IMPORTANT: Track if we've received the final result to avoid early ready status
      // Stream processing for stdout
      const processStdout = async () => {
        const reader = proc.stdout.getReader()
        const decoder = new TextDecoder()
        let buffer = ""
        let assistantText = ""
        let resultText = ""

        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            
            buffer += decoder.decode(value, { stream: true })
            const lines = buffer.split('\n')
            buffer = lines.pop() || ""

            for (const line of lines) {
              if (!line.trim()) continue
              console.log('[CLIService] Raw stdout:', line.substring(0, 100))
              
              try {
                const msg = JSON.parse(line) as CLIMessage
                this.emit('message', msg)

                if (msg.type === 'system' && msg.subtype === 'init') {
                  this.metadata = {
                    sessionId: (msg.session_id as string) || this.sessionId || 'unknown',
                    model: (msg.model as string) || 'unknown',
                    permissionMode: (msg.permissionMode as string) || 'default',
                    claudeCodeVersion: (msg.claude_code_version as string) || 'unknown',
                    slashCommands: (msg.slash_commands as string[]) || [],
                    skills: (msg.skills as string[]) || [],
                    agents: (msg.agents as string[]) || [],
                  }
                  this.emit('init', this.metadata)
                }

                if (msg.type === 'assistant') {
                  const text = this.extractAssistantContent(msg)
                  if (text) assistantText = text
                  this.emit('processing', true, 'Claude is typing...')
                }

                if (msg.type === 'progress') {
                  const task = msg.data?.type === 'tool_progress' 
                    ? `Using tool: ${msg.data.tool_name}`
                    : 'Processing...'
                  this.emit('processing', true, task)
                }

                if (msg.type === 'result') {
                  resultText = (msg.result as string) || ""
                  const usage = msg.usage as Record<string, number> | undefined
                  if (usage) {
                    this.emit('tokenUsage', {
                      inputTokens: usage.input_tokens || 0,
                      outputTokens: usage.output_tokens || 0,
                      cacheReadTokens: usage.cache_read_input_tokens || 0,
                      cacheCreationTokens: usage.cache_creation_input_tokens || 0,
                      totalCostUsd: (msg.total_cost_usd as number) || 0,
                    })
                  }
                }
              } catch { }
            }
          }
        } finally {
          reader.releaseLock()
          const finalText = resultText || assistantText
          if (finalText) this.emit('assistantMessage', finalText)
        }
      }

      const stdoutPromise = processStdout()
      const stderrPromise = (async () => {
        const reader = proc.stderr.getReader()
        const decoder = new TextDecoder()
        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            const text = decoder.decode(value)
            if (text && !text.includes('[DEBUG]')) {
              this.emit('error', text)
              // Auto-recovery: If session is locked, switch to a new ID immediately
              if (text.includes('already in use') && this.sessionId) {
                console.warn('[CLIService] Session locked! Force killing old process and retrying...')
                
                // FORCE KILL the current process tree to release locks
                const { execSync } = require('child_process')
                try {
                  if (process.platform === 'win32') {
                    execSync(`taskkill /pid ${proc.pid} /f /t`)
                  } else {
                    proc.kill()
                  }
                } catch (e) {}

                // Wait 1s for locks to release
                await new Promise(r => setTimeout(r, 1000))
                
                try {
                  // 1. Find the locked session file
                  const projectDirName = findSessionProjectDir(this.sessionId)
                  
                  // 3. Instead of physical clone, start FRESH session with NO PERSISTENCE
                  // This is the ultimate fix for "already in use" - we make the CLI stateless
                  // and rely entirely on our history injection for context.
                  const newId = randomUUID()
                  console.log('[CLIService] Starting stateless recovery session:', newId)
                  
                  // Modify args to include --no-session-persistence for the next run
                  // Note: We can't modify args of the running process, but we update the session ID
                  // so the NEXT sendMessage call will use it.
                  // Ideally we should auto-retry here, but prompting user is safer.
                  
                  // 4. Update memory state
                  this.sessionId = newId
                  this.emit('sessionUpdate', newId)
                  
                  // 5. Notify user
                  this.emit('assistantMessage', '\n\n**System Note:** Session recovered! I have switched to a stateless mode to bypass the lock. Your history is preserved via context injection. Please retry your message.')
                } catch (e) {
                  console.error('[CLIService] Recovery failed:', e)
                }
              }
            }
          }
        } finally { reader.releaseLock() }
      })()

      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          // Force kill on timeout
          const { execSync } = require('child_process')
          try {
            if (process.platform === 'win32') {
              execSync(`taskkill /pid ${proc.pid} /f /t`)
            } else {
              proc.kill()
            }
          } catch (e) {}
          reject(new CLIServiceError('Timeout: Claude CLI did not respond in time'))
        }, this.timeoutMs)
      })

      const resultPromise = (async () => {
        const exitCode = await proc.exited
        await Promise.all([stdoutPromise, stderrPromise])
        console.log('[CLIService] Process exited:', exitCode)
        this.emit('exit', exitCode)
        if (exitCode === 0) this.sessionCreated = true
      })()

      await Promise.race([resultPromise, timeoutPromise])
      
    } catch (err: any) {
      this.emit('error', err.message || String(err))
    } finally {
      this.isProcessing = false
      this.emit('processing', false)
    }
  }

  /**
   * Stop any running process (no-op since each call is independent)
   */
  async stop(): Promise<void> {
    this.isProcessing = false
    this.sessionId = null
    this.metadata = null
    this.sessionCreated = false
  }

  /**
   * Check if the service is ready to accept messages
   */
  isRunning(): boolean {
    return this.sessionId !== null
  }

  /**
   * Check if currently processing a message
   */
  isBusy(): boolean {
    return this.isProcessing
  }

  /**
   * Get the current session ID
   */
  getSessionId(): string | null {
    return this.sessionId
  }

  /**
   * Get session metadata (model, mode, commands, etc.)
   */
  getMetadata(): SessionMetadata | null {
    return this.metadata
  }
}
