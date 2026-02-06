import { spawn, ChildProcess } from 'child_process'
import { EventEmitter } from 'events'
import { randomUUID } from 'crypto'

export class CLIServiceError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CLIServiceError'
  }
}

export interface CLIServiceOptions {
  /** Response timeout in milliseconds (default: 60000) */
  timeoutMs?: number
}

export interface CLIMessage {
  type: string
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
}

/**
 * CLIService - Manages Claude CLI process lifecycle
 * 
 * Uses Plan A (持续交互模式) for persistent session communication.
 * Spawns claude process with --session-id and --output-format stream-json.
 * 
 * Events:
 * - ready: Process started successfully
 * - message: Parsed JSON message from stdout
 * - raw: Non-JSON line from stdout
 * - error: stderr output
 * - exit: Process exited
 * - timeout: No response within timeout period
 */
export class CLIService extends EventEmitter {
  private process: ChildProcess | null = null
  private sessionId: string | null = null
  private timeoutMs: number
  private responseTimeout: NodeJS.Timeout | null = null
  private stdoutBuffer: string = ''

  constructor(options: CLIServiceOptions = {}) {
    super()
    this.timeoutMs = options.timeoutMs ?? 60000
  }

  /**
   * Start the Claude CLI process
   * @param sessionId - Optional session ID (UUID format). Auto-generated if not provided.
   */
  async start(sessionId?: string): Promise<void> {
    if (this.process) {
      throw new CLIServiceError('Process already started. Call stop() first.')
    }

    this.sessionId = sessionId || randomUUID()
    this.stdoutBuffer = ''

    this.process = spawn('claude', [
      '--session-id', this.sessionId,
      '--output-format', 'stream-json'
    ], {
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: true
    })

    this.setupProcessHandlers()
    this.emit('ready')
  }

  /**
   * Send a message to the Claude CLI
   * @param content - Message content to send
   */
  async sendMessage(content: string): Promise<void> {
    if (!this.process?.stdin) {
      throw new CLIServiceError('Process not started. Call start() first.')
    }

    const message = {
      type: 'user',
      message: { role: 'user', content }
    }

    this.process.stdin.write(JSON.stringify(message) + '\n')
    this.resetTimeout()
  }

  /**
   * Stop the Claude CLI process gracefully
   */
  async stop(): Promise<void> {
    this.clearTimeout()

    if (this.process) {
      this.process.kill('SIGTERM')
      this.process = null
      this.sessionId = null
    }
  }

  /**
   * Check if the process is currently running
   */
  isRunning(): boolean {
    return this.process !== null
  }

  /**
   * Get the current session ID
   */
  getSessionId(): string | null {
    return this.sessionId
  }

  private setupProcessHandlers(): void {
    if (!this.process) return

    // Handle stdout - parse stream-json lines
    this.process.stdout?.on('data', (data: Buffer) => {
      this.handleStdout(data)
    })

    // Handle stderr - emit errors
    this.process.stderr?.on('data', (data: Buffer) => {
      this.emit('error', data.toString())
    })

    // Handle process exit
    this.process.on('exit', (code) => {
      this.clearTimeout()
      this.emit('exit', code)
      this.process = null
      this.sessionId = null
    })
  }

  private handleStdout(data: Buffer): void {
    // Reset timeout on any output (response received)
    this.clearTimeout()

    // Append to buffer for handling partial JSON
    this.stdoutBuffer += data.toString()

    // Process complete lines
    const lines = this.stdoutBuffer.split('\n')
    
    // Keep incomplete last line in buffer
    this.stdoutBuffer = lines.pop() || ''

    for (const line of lines) {
      if (!line.trim()) continue

      try {
        const msg = JSON.parse(line) as CLIMessage
        this.emit('message', msg)
      } catch {
        this.emit('raw', line)
      }
    }
  }

  private resetTimeout(): void {
    this.clearTimeout()
    
    this.responseTimeout = setTimeout(() => {
      this.emit('timeout')
    }, this.timeoutMs)
  }

  private clearTimeout(): void {
    if (this.responseTimeout) {
      clearTimeout(this.responseTimeout)
      this.responseTimeout = null
    }
  }
}

// Re-export for convenience
export type { ChildProcess }
