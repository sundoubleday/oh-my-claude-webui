import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { createBunWebSocket } from 'hono/bun'
import mcpRoutes from './routes/mcp'
import transcriptsRoutes from './routes/transcripts'
import skillsRoutes from './routes/skills'
import commandsRoutes from './routes/commands'
import pluginsRoutes from './routes/plugins'

const { upgradeWebSocket, websocket } = createBunWebSocket()
const app = new Hono()

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

// WebSocket 端点（预留）
app.get('/ws/chat', upgradeWebSocket((c) => ({
  onMessage: (event, ws) => {
    console.log('Received:', event.data)
  },
  onOpen: () => {
    console.log('WebSocket connected')
  },
  onClose: () => {
    console.log('WebSocket closed')
  }
})))

export default {
  port: 5757,
  fetch: app.fetch,
  websocket
}
