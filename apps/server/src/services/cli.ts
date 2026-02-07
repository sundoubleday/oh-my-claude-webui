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
    if (msg.type !== 'assistant' || !msg.message) return null
    
    const content = msg.message.content
    if (typeof content === 'string') return content
    
    // Handle array of content blocks
    if (Array.isArray(content)) {
      return content
        .filter(block => block.type === 'text' && block.text)
        .map(block => block.text)
        .join('\n')
    }
    
    return null
  }

  /**
   * Send a message to the Claude CLI using stream-json format
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
      console.log('[CLIService] Spawning with Bun.spawn (stream-json)...')
      console.log('[CLIService] Session:', this.sessionId, 'Created:', this.sessionCreated)
      
      // Build command args
      // First message: use --session-id to create session
      // Subsequent messages: use --resume to continue session
      const args = [
        'node',
        CLAUDE_CLI_JS,
        '-p', content,
        '--output-format', 'stream-json',
        '--verbose'
      ]
      
      if (this.sessionCreated) {
        // Resume existing session
        args.push('--resume', this.sessionId)
      } else {
        // Create new session with specific ID
        args.push('--session-id', this.sessionId)
      }
      
      // Use stream-json format for rich metadata
      const proc = Bun.spawn(args, {
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
          // Only emit as error if it's not just debug output
          if (!stderr.includes('[DEBUG]')) {
            this.emit('error', stderr)
          }
        }

        // Parse stream-json output (multiple JSON lines)
        const messages = this.parseStreamJson(stdout)
        console.log('[CLIService] Parsed', messages.length, 'messages')

        let assistantText: string | null = null
        let resultText: string | null = null

        for (const msg of messages) {
          // Emit raw message for debugging
          this.emit('message', msg)

          // Handle init message - extract metadata
          if (msg.type === 'system' && msg.subtype === 'init') {
            this.metadata = {
              model: (msg.model as string) || 'unknown',
              permissionMode: (msg.permissionMode as string) || 'default',
              claudeCodeVersion: (msg.claude_code_version as string) || 'unknown',
              slashCommands: (msg.slash_commands as string[]) || [],
              skills: (msg.skills as string[]) || [],
              agents: (msg.agents as string[]) || [],
            }
            console.log('[CLIService] Metadata:', this.metadata.model, this.metadata.permissionMode)
            this.emit('init', this.metadata)
          }

          // Handle assistant message - extract content
          if (msg.type === 'assistant') {
            const text = this.extractAssistantContent(msg)
            if (text) {
              assistantText = text
            }
          }

          // Handle result message - extract final text and token usage
          if (msg.type === 'result') {
            resultText = (msg.result as string) || null
            
            // Extract token usage
            const usage = msg.usage as Record<string, number> | undefined
            if (usage) {
              const tokenUsage: TokenUsage = {
                inputTokens: usage.input_tokens || 0,
                outputTokens: usage.output_tokens || 0,
                cacheReadTokens: usage.cache_read_input_tokens || 0,
                cacheCreationTokens: usage.cache_creation_input_tokens || 0,
                totalCostUsd: (msg.total_cost_usd as number) || 0,
              }
              console.log('[CLIService] Token usage:', tokenUsage)
              this.emit('tokenUsage', tokenUsage)
            }
          }
        }

        // Emit the final assistant response (prefer result.result over assistant message)
        const finalText = resultText || assistantText
        if (finalText) {
          console.log('[CLIService] Emitting assistant message, length:', finalText.length)
          this.emit('assistantMessage', finalText)
        }

        this.emit('exit', proc.exitCode)
        
        // Mark session as created after successful first message
        if (proc.exitCode === 0 || proc.exitCode === null) {
          this.sessionCreated = true
        }
        
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
