import { Hono } from 'hono'
import { ConfigService } from '../services/config'

const mcp = new Hono()
const configService = new ConfigService()

// GET /api/mcp - 获取所有 MCP 服务器
mcp.get('/', async (c) => {
  try {
    const { data } = await configService.read(configService.getConfigPath())
    const mcpServers = (data as any).mcpServers || {}
    return c.json(mcpServers)
  } catch (error) {
    console.error('Failed to read config:', error)
    return c.json({ error: 'Failed to read config' }, 500)
  }
})

// POST /api/mcp - 添加新 MCP 服务器
mcp.post('/', async (c) => {
  try {
    const body = await c.req.json()
    const { name, config } = body
    
    if (!name || !config) {
      return c.json({ error: 'Missing name or config' }, 400)
    }
    
    const { data } = await configService.read(configService.getConfigPath())
    const currentConfig = data as any
    
    if (!currentConfig.mcpServers) {
      currentConfig.mcpServers = {}
    }
    
    if (currentConfig.mcpServers[name]) {
      return c.json({ error: 'MCP server already exists' }, 400)
    }
    
    currentConfig.mcpServers[name] = config
    await configService.write(configService.getConfigPath(), currentConfig)
    
    return c.json({ success: true, name })
  } catch (error) {
    console.error('Failed to add MCP server:', error)
    return c.json({ error: 'Failed to add MCP server' }, 500)
  }
})

// PUT /api/mcp/:name - 更新 MCP 服务器
mcp.put('/:name', async (c) => {
  try {
    const name = c.req.param('name')
    const config = await c.req.json()
    
    const { data } = await configService.read(configService.getConfigPath())
    const currentConfig = data as any
    
    if (!currentConfig.mcpServers?.[name]) {
      return c.json({ error: 'MCP server not found' }, 404)
    }
    
    currentConfig.mcpServers[name] = config
    await configService.write(configService.getConfigPath(), currentConfig)
    
    return c.json({ success: true, name })
  } catch (error) {
    console.error('Failed to update MCP server:', error)
    return c.json({ error: 'Failed to update MCP server' }, 500)
  }
})

// DELETE /api/mcp/:name - 删除 MCP 服务器
mcp.delete('/:name', async (c) => {
  try {
    const name = c.req.param('name')
    
    const { data } = await configService.read(configService.getConfigPath())
    const currentConfig = data as any
    
    if (!currentConfig.mcpServers?.[name]) {
      return c.json({ error: 'MCP server not found' }, 404)
    }
    
    delete currentConfig.mcpServers[name]
    await configService.write(configService.getConfigPath(), currentConfig)
    
    return c.json({ success: true, name })
  } catch (error) {
    console.error('Failed to delete MCP server:', error)
    return c.json({ error: 'Failed to delete MCP server' }, 500)
  }
})

export default mcp
