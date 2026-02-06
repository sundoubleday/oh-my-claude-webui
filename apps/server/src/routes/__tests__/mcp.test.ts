import { describe, it, expect, beforeEach, mock } from 'bun:test'
import { Hono } from 'hono'

// Mock ConfigService before importing mcpRoutes
const mockRead = mock()
const mockWrite = mock()
const mockGetConfigPath = mock(() => '/mock/path/.claude.json')

mock.module('../../services/config', () => {
  return {
    ConfigService: class {
      read = mockRead
      write = mockWrite
      getConfigPath = mockGetConfigPath
    }
  }
})

// Now import the routes
import mcpRoutes from '../mcp'

const app = new Hono()
app.route('/api/mcp', mcpRoutes)

describe('MCP API', () => {
  beforeEach(() => {
    mockRead.mockClear()
    mockWrite.mockClear()
    mockGetConfigPath.mockClear()
  })

  it('GET /api/mcp should return MCP servers list', async () => {
    const mockData = {
      mcpServers: {
        'test-server': { type: 'http', url: 'https://test.com', enabled: true }
      }
    }
    mockRead.mockResolvedValue({ data: mockData })

    const res = await app.request('/api/mcp')
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toEqual(mockData.mcpServers)
  })

  it('POST /api/mcp should add new MCP server', async () => {
    mockRead.mockResolvedValue({ data: { mcpServers: {} } })
    mockWrite.mockResolvedValue(undefined)

    const res = await app.request('/api/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'new-server',
        config: { type: 'http', url: 'https://new.com', enabled: true }
      })
    })

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.success).toBe(true)
    expect(json.name).toBe('new-server')
    expect(mockWrite).toHaveBeenCalled()
  })

  it('POST /api/mcp should fail if server already exists', async () => {
    mockRead.mockResolvedValue({ 
      data: { mcpServers: { 'existing': {} } } 
    })

    const res = await app.request('/api/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'existing',
        config: { type: 'http', url: 'https://existing.com' }
      })
    })

    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toBe('MCP server already exists')
  })

  it('PUT /api/mcp/:name should update existing server', async () => {
    mockRead.mockResolvedValue({ 
      data: { mcpServers: { 'to-update': { type: 'http', url: 'old' } } } 
    })
    mockWrite.mockResolvedValue(undefined)

    const res = await app.request('/api/mcp/to-update', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'http', url: 'new' })
    })

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.success).toBe(true)
    expect(mockWrite).toHaveBeenCalled()
  })

  it('DELETE /api/mcp/:name should remove server', async () => {
    mockRead.mockResolvedValue({ 
      data: { mcpServers: { 'to-delete': {} } } 
    })
    mockWrite.mockResolvedValue(undefined)

    const res = await app.request('/api/mcp/to-delete', {
      method: 'DELETE'
    })

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.success).toBe(true)
    expect(mockWrite).toHaveBeenCalled()
  })

  it('DELETE /api/mcp/:name should return 404 if not found', async () => {
    mockRead.mockResolvedValue({ data: { mcpServers: {} } })

    const res = await app.request('/api/mcp/non-existent', {
      method: 'DELETE'
    })

    expect(res.status).toBe(404)
  })
})
