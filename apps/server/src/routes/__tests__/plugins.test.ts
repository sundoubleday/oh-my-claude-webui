import { describe, it, expect, beforeEach, mock } from 'bun:test'
import { Hono } from 'hono'

// Mock fs/promises and os before importing pluginsRoutes
const mockReadFile = mock()
const mockWriteFile = mock()
const mockRm = mock()
const mockHomedir = mock(() => '/mock/home')

mock.module('fs/promises', () => ({
  readFile: mockReadFile,
  writeFile: mockWriteFile,
  rm: mockRm,
}))

mock.module('os', () => ({
  homedir: mockHomedir,
}))

// Now import the routes
import pluginsRoutes from '../plugins'

const app = new Hono()
app.route('/api/plugins', pluginsRoutes)

describe('Plugins API', () => {
  beforeEach(() => {
    mockReadFile.mockClear()
    mockWriteFile.mockClear()
    mockRm.mockClear()
    mockHomedir.mockClear()
  })

  it('GET /api/plugins should return plugins list', async () => {
    const mockPluginsData = {
      version: 2,
      plugins: {
        'test-plugin@scope': [
          {
            scope: 'user',
            installPath: 'C:\\Users\\test\\.claude\\plugins\\cache\\scope\\test-plugin\\1.0.0',
            version: '1.0.0',
            installedAt: '2026-02-06T10:00:00.000Z',
            lastUpdated: '2026-02-06T10:00:00.000Z',
            gitCommitSha: 'abc123',
          },
        ],
        'another-plugin@another': [
          {
            scope: 'user',
            installPath: 'C:\\Users\\test\\.claude\\plugins\\cache\\another\\another-plugin\\2.0.0',
            version: '2.0.0',
            installedAt: '2026-02-05T10:00:00.000Z',
            lastUpdated: '2026-02-05T10:00:00.000Z',
            gitCommitSha: 'def456',
          },
        ],
      },
    }
    mockReadFile.mockResolvedValue(JSON.stringify(mockPluginsData))

    const res = await app.request('/api/plugins')
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(Array.isArray(json)).toBe(true)
    expect(json.length).toBe(2)
    expect(json[0]).toEqual({
      name: 'test-plugin@scope',
      version: '1.0.0',
      installPath: 'C:\\Users\\test\\.claude\\plugins\\cache\\scope\\test-plugin\\1.0.0',
      installedAt: '2026-02-06T10:00:00.000Z',
    })
  })

  it('GET /api/plugins should return empty array if no plugins', async () => {
    mockReadFile.mockResolvedValue(JSON.stringify({ version: 2, plugins: {} }))

    const res = await app.request('/api/plugins')
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toEqual([])
  })

  it('GET /api/plugins should handle file read errors', async () => {
    mockReadFile.mockRejectedValue(new Error('ENOENT'))

    const res = await app.request('/api/plugins')
    expect(res.status).toBe(500)
    const json = await res.json()
    expect(json.error).toBe('Failed to read plugins')
  })

  it('DELETE /api/plugins/:name should remove plugin and delete cache', async () => {
    const mockPluginsData = {
      version: 2,
      plugins: {
        'to-delete@scope': [
          {
            scope: 'user',
            installPath: 'C:\\Users\\test\\.claude\\plugins\\cache\\scope\\to-delete\\1.0.0',
            version: '1.0.0',
            installedAt: '2026-02-06T10:00:00.000Z',
            lastUpdated: '2026-02-06T10:00:00.000Z',
            gitCommitSha: 'abc123',
          },
        ],
        'keep@scope': [
          {
            scope: 'user',
            installPath: 'C:\\Users\\test\\.claude\\plugins\\cache\\scope\\keep\\1.0.0',
            version: '1.0.0',
            installedAt: '2026-02-06T10:00:00.000Z',
            lastUpdated: '2026-02-06T10:00:00.000Z',
            gitCommitSha: 'def456',
          },
        ],
      },
    }
    mockReadFile.mockResolvedValue(JSON.stringify(mockPluginsData))
    mockWriteFile.mockResolvedValue(undefined)
    mockRm.mockResolvedValue(undefined)

    const res = await app.request('/api/plugins/to-delete@scope', {
      method: 'DELETE',
    })

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.success).toBe(true)
    expect(json.name).toBe('to-delete@scope')

    // Verify backup was created
    expect(mockWriteFile).toHaveBeenCalledTimes(2)
    const backupCall = mockWriteFile.mock.calls.find((call: any) => call[0].includes('.bak'))
    expect(backupCall).toBeDefined()

    // Verify cache deletion
    expect(mockRm).toHaveBeenCalledWith(
      'C:\\Users\\test\\.claude\\plugins\\cache\\scope\\to-delete\\1.0.0',
      { recursive: true, force: true }
    )
  })

  it('DELETE /api/plugins/:name should return 404 if plugin not found', async () => {
    mockReadFile.mockResolvedValue(JSON.stringify({ version: 2, plugins: {} }))

    const res = await app.request('/api/plugins/non-existent', {
      method: 'DELETE',
    })

    expect(res.status).toBe(404)
    const json = await res.json()
    expect(json.error).toBe('Plugin not found')
  })

  it('DELETE /api/plugins/:name should handle errors gracefully', async () => {
    mockReadFile.mockRejectedValue(new Error('Permission denied'))

    const res = await app.request('/api/plugins/test', {
      method: 'DELETE',
    })

    expect(res.status).toBe(500)
    const json = await res.json()
    expect(json.error).toBe('Failed to delete plugin')
  })

  it('DELETE /api/plugins/:name should continue if cache deletion fails', async () => {
    const mockPluginsData = {
      version: 2,
      plugins: {
        'test@scope': [
          {
            scope: 'user',
            installPath: 'C:\\Users\\test\\.claude\\plugins\\cache\\scope\\test\\1.0.0',
            version: '1.0.0',
            installedAt: '2026-02-06T10:00:00.000Z',
            lastUpdated: '2026-02-06T10:00:00.000Z',
            gitCommitSha: 'abc123',
          },
        ],
      },
    }
    mockReadFile.mockResolvedValue(JSON.stringify(mockPluginsData))
    mockWriteFile.mockResolvedValue(undefined)
    mockRm.mockRejectedValue(new Error('Cache dir not found'))

    const res = await app.request('/api/plugins/test@scope', {
      method: 'DELETE',
    })

    // Should still succeed even if cache deletion fails
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.success).toBe(true)
  })
})
