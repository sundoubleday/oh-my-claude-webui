import { describe, it, expect, beforeEach, mock } from 'bun:test'
import { Hono } from 'hono'

// Mock fs/promises and os before importing commandsRoutes
const mockReaddir = mock()
const mockReadFile = mock()
const mockWriteFile = mock()
const mockUnlink = mock()
const mockAccess = mock()
const mockHomedir = mock(() => '/mock/home')

mock.module('fs/promises', () => ({
  readdir: mockReaddir,
  readFile: mockReadFile,
  writeFile: mockWriteFile,
  unlink: mockUnlink,
  access: mockAccess,
  constants: { F_OK: 0 }
}))

mock.module('os', () => ({
  homedir: mockHomedir
}))

// Now import the routes
import commandsRoutes from '../commands'

const app = new Hono()
app.route('/api/commands', commandsRoutes)

describe('Commands API', () => {
  beforeEach(() => {
    mockReaddir.mockClear()
    mockReadFile.mockClear()
    mockWriteFile.mockClear()
    mockUnlink.mockClear()
    mockAccess.mockClear()
    mockHomedir.mockClear()
  })

  describe('GET /api/commands', () => {
    it('should return empty array when no commands exist', async () => {
      mockReaddir.mockResolvedValue([])

      const res = await app.request('/api/commands')
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json).toEqual([])
    })

    it('should return list of commands', async () => {
      mockReaddir.mockResolvedValue([
        'analyze.md',
        'review.md',
        'not-a-command.txt', // Should be filtered out
        'deploy.md'
      ])

      const res = await app.request('/api/commands')
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json).toHaveLength(3)
      expect(json).toContainEqual({ name: 'analyze', path: expect.stringContaining('analyze.md') })
      expect(json).toContainEqual({ name: 'review', path: expect.stringContaining('review.md') })
      expect(json).toContainEqual({ name: 'deploy', path: expect.stringContaining('deploy.md') })
    })

    it('should handle read errors gracefully', async () => {
      mockReaddir.mockRejectedValue(new Error('ENOENT: directory not found'))

      const res = await app.request('/api/commands')
      expect(res.status).toBe(500)
      const json = await res.json()
      expect(json.error).toBeDefined()
    })
  })

  describe('GET /api/commands/:name', () => {
    it('should return command content', async () => {
      const mockContent = '# Analyze Command\n\nThis analyzes code.'
      mockAccess.mockResolvedValue(undefined)
      mockReadFile.mockResolvedValue(mockContent)

      const res = await app.request('/api/commands/analyze')
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.name).toBe('analyze')
      expect(json.content).toBe(mockContent)
    })

    it('should return 404 if command does not exist', async () => {
      mockAccess.mockRejectedValue(new Error('ENOENT'))

      const res = await app.request('/api/commands/nonexistent')
      expect(res.status).toBe(404)
      const json = await res.json()
      expect(json.error).toBe('Command not found')
    })

    it('should reject unsafe filenames', async () => {
      const res = await app.request('/api/commands/../etc/passwd')
      expect(res.status).toBe(400)
      const json = await res.json()
      expect(json.error).toContain('Invalid command name')
    })

    it('should reject filenames with path separators', async () => {
      const res = await app.request('/api/commands/foo/bar')
      expect(res.status).toBe(400)
    })
  })

  describe('POST /api/commands', () => {
    it('should create new command', async () => {
      mockAccess.mockRejectedValue(new Error('ENOENT')) // File doesn't exist
      mockWriteFile.mockResolvedValue(undefined)

      const res = await app.request('/api/commands', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'newcommand',
          content: '# New Command\n\nDoes something cool.'
        })
      })

      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.success).toBe(true)
      expect(json.name).toBe('newcommand')
      expect(mockWriteFile).toHaveBeenCalledWith(
        expect.stringContaining('newcommand.md'),
        '# New Command\n\nDoes something cool.',
        'utf-8'
      )
    })

    it('should return 400 if name is missing', async () => {
      const res = await app.request('/api/commands', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: 'test' })
      })

      expect(res.status).toBe(400)
      const json = await res.json()
      expect(json.error).toContain('name')
    })

    it('should return 400 if content is missing', async () => {
      const res = await app.request('/api/commands', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'test' })
      })

      expect(res.status).toBe(400)
      const json = await res.json()
      expect(json.error).toContain('content')
    })

    it('should return 400 for invalid filename', async () => {
      const res = await app.request('/api/commands', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: '../evil',
          content: 'bad stuff'
        })
      })

      expect(res.status).toBe(400)
      const json = await res.json()
      expect(json.error).toContain('Invalid command name')
    })

    it('should return 409 if command already exists', async () => {
      mockAccess.mockResolvedValue(undefined) // File exists

      const res = await app.request('/api/commands', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'existing',
          content: 'test'
        })
      })

      expect(res.status).toBe(409)
      const json = await res.json()
      expect(json.error).toBe('Command already exists')
    })

    it('should reject special characters in name', async () => {
      const invalidNames = ['test<script>', 'test|pipe', 'test?query', 'test*glob']
      
      for (const name of invalidNames) {
        const res = await app.request('/api/commands', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, content: 'test' })
        })
        expect(res.status).toBe(400)
      }
    })
  })

  describe('PUT /api/commands/:name', () => {
    it('should update existing command', async () => {
      mockAccess.mockResolvedValue(undefined) // File exists
      mockWriteFile.mockResolvedValue(undefined)

      const res = await app.request('/api/commands/existing', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: 'Updated content' })
      })

      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.success).toBe(true)
      expect(mockWriteFile).toHaveBeenCalledWith(
        expect.stringContaining('existing.md'),
        'Updated content',
        'utf-8'
      )
    })

    it('should return 404 if command does not exist', async () => {
      mockAccess.mockRejectedValue(new Error('ENOENT'))

      const res = await app.request('/api/commands/nonexistent', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: 'test' })
      })

      expect(res.status).toBe(404)
      const json = await res.json()
      expect(json.error).toBe('Command not found')
    })

    it('should return 400 if content is empty', async () => {
      mockAccess.mockResolvedValue(undefined)

      const res = await app.request('/api/commands/test', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: '' })
      })

      expect(res.status).toBe(400)
      const json = await res.json()
      expect(json.error).toContain('content')
    })

    it('should reject unsafe filenames', async () => {
      const res = await app.request('/api/commands/../evil', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: 'test' })
      })

      expect(res.status).toBe(400)
      const json = await res.json()
      expect(json.error).toContain('Invalid command name')
    })
  })

  describe('DELETE /api/commands/:name', () => {
    it('should delete existing command', async () => {
      mockAccess.mockResolvedValue(undefined) // File exists
      mockUnlink.mockResolvedValue(undefined)

      const res = await app.request('/api/commands/todelete', {
        method: 'DELETE'
      })

      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.success).toBe(true)
      expect(mockUnlink).toHaveBeenCalledWith(expect.stringContaining('todelete.md'))
    })

    it('should return 404 if command does not exist', async () => {
      mockAccess.mockRejectedValue(new Error('ENOENT'))

      const res = await app.request('/api/commands/nonexistent', {
        method: 'DELETE'
      })

      expect(res.status).toBe(404)
      const json = await res.json()
      expect(json.error).toBe('Command not found')
    })

    it('should reject unsafe filenames', async () => {
      const res = await app.request('/api/commands/../../evil', {
        method: 'DELETE'
      })

      expect(res.status).toBe(400)
      const json = await res.json()
      expect(json.error).toContain('Invalid command name')
    })
  })
})
