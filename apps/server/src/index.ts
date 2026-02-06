import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { createBunWebSocket } from 'hono/bun'

const { upgradeWebSocket, websocket } = createBunWebSocket()
const app = new Hono()

// CORS 配置
app.use('/*', cors({
  origin: 'http://localhost:3000',
  credentials: true,
}))

// 健康检查端点
app.get('/health', (c) => c.json({ status: 'ok' }))

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
