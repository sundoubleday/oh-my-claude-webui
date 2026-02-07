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
  /** Response timeout in milliseconds (default: 120000) */
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
  processing: (isProcessing: boolean) => void
}

/**
 * CLIService - Manages Claude CLI process lifecycle
 * 
 * Uses Plan B (单次调用模式) - spawns a new process for each message.
 * Uses --print flag with --session-id for conversation context.
 * 
 * Note: Each message takes 2-5 seconds to start due to process spawn overhead.
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
  private currentProcess: ChildProcess | null = null

  constructor(options: CLIServiceOptions = {}) {
    super()
    this.timeoutMs = options.timeoutMs ?? 120000 // 2 minutes default for Plan B
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

    return new Promise((resolve, reject) => {
      let stdoutBuffer = ''
      let stderrBuffer = ''
      let timeoutId: NodeJS.Timeout | null = null

      // Spawn claude with --print mode and stream-json output
      // Note: --output-format stream-json requires --verbose when used with --print
      const proc = spawn('claude', [
        '--session-id', this.sessionId!,
        '--print', content,
        '--output-format', 'stream-json',
        '--verbose'
      ], {
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: true
      })

      this.currentProcess = proc

      // Set timeout
      timeoutId = setTimeout(() => {
        if (this.isProcessing) {
          proc.kill('SIGTERM')
          this.isProcessing = false
          this.currentProcess = null
          this.emit('processing', false)
          this.emit('timeout')
          reject(new CLIServiceError('Timeout: Claude CLI did not respond in time'))
        }
      }, this.timeoutMs)

      // Handle stdout - parse stream-json lines
      proc.stdout?.on('data', (data: Buffer) => {
        stdoutBuffer += data.toString()
        
        // Process complete lines
        const lines = stdoutBuffer.split('\n')
        stdoutBuffer = lines.pop() || '' // Keep incomplete line in buffer

        for (const line of lines) {
          if (!line.trim()) continue

          try {
            const msg = JSON.parse(line) as CLIMessage
            this.emit('message', msg)
          } catch {
            this.emit('raw', line)
          }
        }
      })

      // Handle stderr
      proc.stderr?.on('data', (data: Buffer) => {
        stderrBuffer += data.toString()
        this.emit('error', data.toString())
      })

      // Handle process exit
      proc.on('close', (code) => {
        if (timeoutId) {
          clearTimeout(timeoutId)
          timeoutId = null
        }

        this.isProcessing = false
        this.currentProcess = null
        this.emit('processing', false)

        // Process any remaining buffer content
        if (stdoutBuffer.trim()) {
          try {
            const msg = JSON.parse(stdoutBuffer) as CLIMessage
            this.emit('message', msg)
          } catch {
            this.emit('raw', stdoutBuffer)
          }
        }

        this.emit('exit', code)

        if (code === 0) {
          resolve()
        } else {
          reject(new CLIServiceError(stderrBuffer || `Process exited with code ${code}`))
        }
      })

      proc.on('error', (err) => {
        if (timeoutId) {
          clearTimeout(timeoutId)
          timeoutId = null
        }

        this.isProcessing = false
        this.currentProcess = null
        this.emit('processing', false)
        this.emit('error', err.message)
        reject(new CLIServiceError(`Failed to spawn process: ${err.message}`))
      })
    })
  }

  /**
   * Stop any running process
   */
  async stop(): Promise<void> {
    if (this.currentProcess) {
      this.currentProcess.kill('SIGTERM')
      this.currentProcess = null
    }
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

// Re-export for convenience
export type { ChildProcess }
