import { EventEmitter } from 'events'
import { randomUUID } from 'crypto'
import { homedir } from 'os'
import { join } from 'path'

// Windows: claude.cmd wraps node + cli.js, but spawn can't capture output from .cmd
// Solution: Call node directly with cli.js path
const CLAUDE_CLI_JS = join(
  homedir(),
  'AppData', 'Roaming', 'npm', 'node_modules',
  '@anthropic-ai', 'claude-code', 'cli.js'
)

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
  result?: string
  message?: {
    role?: string
    content?: string
  }
  [key: string]: unknown
}

export interface CLIServiceEvents {
  ready: () => void
  message: (msg: CLIMessage) => void
  raw: (line: string) => void
  error: (error: string) => void
  exit: (code: number | null) => void
  timeout: () => void
  processing: (isProcessing: boolean) => void
}

/**
 * CLIService - Manages Claude CLI process lifecycle
 * 
 * Uses Plan B (单次调用模式) - spawns a new process for each message.
 * Uses --print flag with --session-id for conversation context.
 * 
 * IMPORTANT: Uses Bun.spawn instead of child_process.spawn for proper
 * stdout capture on Windows.
 * 
 * Events:
 * - ready: Service initialized
 * - message: Parsed JSON message from stdout
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

  constructor(options: CLIServiceOptions = {}) {
    super()
    this.timeoutMs = options.timeoutMs ?? 120000 // 2 minutes default
  }

  /**
   * Initialize the CLI service with a session ID
   * @param sessionId - Optional session ID (UUID format). Auto-generated if not provided.
   */
  async start(sessionId?: string): Promise<void> {
    this.sessionId = sessionId || randomUUID()
    this.emit('ready')
  }

  /**
   * Send a message to the Claude CLI using --print mode
   * @param content - Message content to send
   */
  async sendMessage(content: string): Promise<void> {
    if (!this.sessionId) {
      throw new CLIServiceError('Service not started. Call start() first.')
    }

    if (this.isProcessing) {
      throw new CLIServiceError('Previous message still processing. Please wait.')
    }

    this.isProcessing = true
    this.emit('processing', true)

    try {
      console.log('[CLIService] Spawning with Bun.spawn...')
      console.log('[CLIService] Session:', this.sessionId)
      
      // Use Bun.spawn for proper stdout capture on Windows
      const proc = Bun.spawn([
        'node',
        CLAUDE_CLI_JS,
        '-p', content,
        '--session-id', this.sessionId,
        '--output-format', 'json'
      ], {
        stdout: 'pipe',
        stderr: 'pipe',
      })

      console.log('[CLIService] Process spawned, PID:', proc.pid)

      // Set up timeout
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          proc.kill()
          reject(new CLIServiceError('Timeout: Claude CLI did not respond in time'))
        }, this.timeoutMs)
      })

      // Wait for process to complete with timeout
      const resultPromise = (async () => {
        const stdout = await new Response(proc.stdout).text()
        const stderr = await new Response(proc.stderr).text()
        
        console.log('[CLIService] Process completed')
        console.log('[CLIService] stdout length:', stdout.length)
        
        if (stderr) {
          console.log('[CLIService] stderr:', stderr)
          this.emit('error', stderr)
        }

        // Parse and emit the JSON response
        if (stdout.trim()) {
          try {
            const msg = JSON.parse(stdout.trim()) as CLIMessage
            console.log('[CLIService] Parsed message type:', msg.type)
            this.emit('message', msg)
          } catch {
            console.log('[CLIService] Failed to parse JSON, emitting raw')
            this.emit('raw', stdout)
          }
        }

        this.emit('exit', proc.exitCode)
        
        if (proc.exitCode !== 0 && proc.exitCode !== null) {
          throw new CLIServiceError(stderr || `Process exited with code ${proc.exitCode}`)
        }
      })()

      await Promise.race([resultPromise, timeoutPromise])
      
    } finally {
      this.isProcessing = false
      this.emit('processing', false)
    }
  }

  /**
   * Stop any running process (no-op for Plan B since each call is independent)
   */
  async stop(): Promise<void> {
    this.isProcessing = false
    this.sessionId = null
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
}
