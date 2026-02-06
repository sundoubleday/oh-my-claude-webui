import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { createBunWebSocket } from 'hono/bun'
import type { WSContext } from 'hono/ws'
import mcpRoutes from './routes/mcp'
import transcriptsRoutes from './routes/transcripts'
import skillsRoutes from './routes/skills'
import commandsRoutes from './routes/commands'
import pluginsRoutes from './routes/plugins'
import { CLIService } from './services/cli'

const { upgradeWebSocket, websocket } = createBunWebSocket()

// Map to track CLIService instances per WebSocket connection
const cliInstances = new Map<WSContext, CLIService>()
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
    
    // Create a new CLIService instance for this connection
    const cli = new CLIService()
    cliInstances.set(ws, cli)
    
    // Forward CLI message events to WebSocket
    cli.on('message', (msg) => {
      ws.send(JSON.stringify({ type: 'message', content: msg }))
    })
    
    // Forward CLI error events to WebSocket
    cli.on('error', (error) => {
      ws.send(JSON.stringify({ type: 'error', error }))
    })
    
    // Handle CLI exit
    cli.on('exit', (code) => {
      ws.send(JSON.stringify({ type: 'status', status: 'stopped' }))
    })
    
    // Send ready status
    ws.send(JSON.stringify({ type: 'status', status: 'ready' }))
  },
  
  onMessage: async (event, ws) => {
    const cli = cliInstances.get(ws)
    if (!cli) {
      ws.send(JSON.stringify({ type: 'error', error: 'No CLI instance found' }))
      return
    }
    
    try {
      const data = JSON.parse(event.data.toString())
      
      if (data.type === 'message') {
        // Start CLI if not running
        if (!cli.isRunning()) {
          try {
            await cli.start(data.sessionId)
            ws.send(JSON.stringify({ type: 'status', status: 'processing' }))
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
    
    const cli = cliInstances.get(ws)
    if (cli) {
      try {
        await cli.stop()
      } catch (error) {
        console.error('Error stopping CLI:', error)
      }
      cliInstances.delete(ws)
    }
  },
  
  onError: (event, ws) => {
    console.error('WebSocket error:', event)
    
    const cli = cliInstances.get(ws)
    if (cli) {
      cli.stop().catch(console.error)
      cliInstances.delete(ws)
    }
  }
})))

export default {
  port: 5757,
  fetch: app.fetch,
  websocket
}
