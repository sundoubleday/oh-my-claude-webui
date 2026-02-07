import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { createBunWebSocket } from 'hono/bun'
import type { WSContext } from 'hono/ws'
import mcpRoutes from './routes/mcp'
import transcriptsRoutes from './routes/transcripts'
import skillsRoutes from './routes/skills'
import commandsRoutes from './routes/commands'
import pluginsRoutes from './routes/plugins'
import { CLIService, type SessionMetadata, type TokenUsage } from './services/cli'

const { upgradeWebSocket, websocket } = createBunWebSocket()

// Map to track CLIService instances per sessionId
const cliInstances = new Map<string, CLIService>()
const app = new Hono()

// Unified error handling middleware
app.onError((err, c) => {
  console.error('Server error:', err)
  const status = (err as any).status || 500
  return c.json({ 
    error: err.message || 'Internal server error',
    code: status
  }, status)
})

// CORS 配置
app.use('/*', cors({
  origin: 'http://localhost:3000',
  credentials: true,
}))

// 健康检查端点
app.get('/health', (c) => c.json({ status: 'ok' }))

// MCP 配置端点
app.route('/api/mcp', mcpRoutes)

// Transcripts 历史端点
app.route('/api/transcripts', transcriptsRoutes)

// Skills 管理端点
app.route('/api/skills', skillsRoutes)

// Commands 管理端点
app.route('/api/commands', commandsRoutes)

// Plugins 管理端点
app.route('/api/plugins', pluginsRoutes)

// WebSocket Chat 端点
app.get('/ws/chat', upgradeWebSocket((c) => ({
  onOpen: (event, ws) => {
    console.log('WebSocket connected')
    
    // Note: We'll store the CLI when we get the first message with sessionId
    // For now, just send ready status
    ws.send(JSON.stringify({ type: 'status', status: 'ready' }))
  },
  
  onMessage: async (event, ws) => {
    try {
      const data = JSON.parse(event.data.toString())
      
      if (data.type === 'message') {
        const sessionId = data.sessionId
        if (!sessionId) {
          ws.send(JSON.stringify({ type: 'error', error: 'No sessionId provided' }))
          return
        }
        
        // Get or create CLI instance for this session
        let cli = cliInstances.get(sessionId)
        if (!cli) {
          console.log('Creating new CLI instance for session:', sessionId)
          cli = new CLIService()
          cliInstances.set(sessionId, cli)
          
          // Forward session metadata (model, mode, commands)
          cli.on('init', (metadata: SessionMetadata) => {
            ws.send(JSON.stringify({ 
              type: 'init', 
              metadata 
            }))
          })
          
          // Forward assistant response text
          cli.on('assistantMessage', (content: string) => {
            ws.send(JSON.stringify({ 
              type: 'message', 
              content: { role: 'assistant', content } 
            }))
          })
          
          // Forward token usage statistics
          cli.on('tokenUsage', (usage: TokenUsage) => {
            ws.send(JSON.stringify({ 
              type: 'tokenUsage', 
              usage 
            }))
          })
          
          // Forward processing state
          cli.on('processing', (isProcessing: boolean) => {
            ws.send(JSON.stringify({ 
              type: 'status', 
              status: isProcessing ? 'processing' : 'ready' 
            }))
          })
          
          // Forward CLI error events to WebSocket
          cli.on('error', (error: string) => {
            ws.send(JSON.stringify({ type: 'error', error }))
          })
          
          // Handle CLI exit
          cli.on('exit', (code: number | null) => {
            // Only send stopped if there was an error
            if (code !== 0 && code !== null) {
              ws.send(JSON.stringify({ type: 'status', status: 'stopped' }))
            }
          })
        }
        
        // Start CLI if not running
        if (!cli.isRunning()) {
          try {
            await cli.start(sessionId)
          } catch (startError) {
            ws.send(JSON.stringify({ 
              type: 'error', 
              error: `Failed to start CLI: ${(startError as Error).message}` 
            }))
            return
          }
        }
        
        // Send message to CLI
        await cli.sendMessage(data.content)
      } else {
        ws.send(JSON.stringify({ 
          type: 'error', 
          error: `Unknown message type: ${data.type}` 
        }))
      }
    } catch (parseError) {
      ws.send(JSON.stringify({ type: 'error', error: 'Invalid message format' }))
    }
  },
  
  onClose: async (event, ws) => {
    console.log('WebSocket closed')
    
    // Note: We don't delete CLI instances on close
    // They remain active for the session and can be reused
    // if the user reconnects with the same sessionId
  },
  
  onError: (event, ws) => {
    console.error('WebSocket error:', event)
    // CLI instances persist even on WebSocket errors
  }
})))

export default {
  port: 5757,
  fetch: app.fetch,
  websocket
}
