import { describe, it, expect, beforeEach, mock } from 'bun:test'
import { Hono } from 'hono'

// Mock fs/promises before importing skillsRoutes
const mockReaddir = mock()
const mockReadFile = mock()
const mockCp = mock()
const mockRm = mock()
const mockStat = mock()

mock.module('fs/promises', () => ({
  readdir: mockReaddir,
  readFile: mockReadFile,
  cp: mockCp,
  rm: mockRm,
  stat: mockStat,
}))

// Mock os module
const mockHomedir = mock(() => '/mock/home')
mock.module('os', () => ({
  homedir: mockHomedir,
}))

// Now import the routes
import skillsRoutes from '../skills'

const app = new Hono()
app.route('/api/skills', skillsRoutes)

describe('Skills API', () => {
  beforeEach(() => {
    mockReaddir.mockClear()
    mockReadFile.mockClear()
    mockCp.mockClear()
    mockRm.mockClear()
    mockStat.mockClear()
    mockHomedir.mockClear()
  })

  describe('GET /api/skills', () => {
    it('should return list of skills with parsed frontmatter', async () => {
      // Mock skills directory listing
      mockReaddir.mockResolvedValue(['skill1', 'skill2', 'not-a-skill'])
      
      // Mock SKILL.md existence check and content
      mockStat
        .mockResolvedValueOnce({ isFile: () => true }) // skill1/SKILL.md exists
        .mockResolvedValueOnce({ isFile: () => true }) // skill2/SKILL.md exists
        .mockRejectedValueOnce(new Error('ENOENT')) // not-a-skill/SKILL.md doesn't exist
      
      mockReadFile
        .mockResolvedValueOnce('---\nname: skill1\ndescription: Test skill 1\n---\nContent') // skill1
        .mockResolvedValueOnce('---\nname: skill2\ndescription: Test skill 2\n---\nContent') // skill2

      const res = await app.request('/api/skills')
      expect(res.status).toBe(200)
      const json = await res.json()
      
      expect(json).toEqual([
        { name: 'skill1', description: 'Test skill 1', path: '/mock/home/.claude/skills/skill1' },
        { name: 'skill2', description: 'Test skill 2', path: '/mock/home/.claude/skills/skill2' },
      ])
    })

    it('should handle skills without valid frontmatter', async () => {
      mockReaddir.mockResolvedValue(['invalid-skill'])
      mockStat.mockResolvedValue({ isFile: () => true })
      mockReadFile.mockResolvedValue('No frontmatter here')

      const res = await app.request('/api/skills')
      expect(res.status).toBe(200)
      const json = await res.json()
      
      expect(json).toEqual([
        { name: 'invalid-skill', description: 'No description', path: '/mock/home/.claude/skills/invalid-skill' },
      ])
    })

    it('should handle empty skills directory', async () => {
      mockReaddir.mockResolvedValue([])

      const res = await app.request('/api/skills')
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json).toEqual([])
    })

    it('should handle directory read error', async () => {
      mockReaddir.mockRejectedValue(new Error('Permission denied'))

      const res = await app.request('/api/skills')
      expect(res.status).toBe(500)
      const json = await res.json()
      expect(json.error).toBeDefined()
    })
  })

  describe('POST /api/skills', () => {
    it('should copy skill from source path', async () => {
      mockCp.mockResolvedValue(undefined)
      mockStat.mockResolvedValue({ isDirectory: () => true })

      const res = await app.request('/api/skills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourcePath: '/source/my-skill',
        }),
      })

      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.success).toBe(true)
      expect(json.name).toBe('my-skill')
      expect(mockCp).toHaveBeenCalledWith(
        '/source/my-skill',
        '/mock/home/.claude/skills/my-skill',
        { recursive: true }
      )
    })

    it('should fail if sourcePath is missing', async () => {
      const res = await app.request('/api/skills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })

      expect(res.status).toBe(400)
      const json = await res.json()
      expect(json.error).toBe('Missing sourcePath')
    })

    it('should fail if source path does not exist', async () => {
      mockStat.mockRejectedValue(new Error('ENOENT'))

      const res = await app.request('/api/skills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourcePath: '/nonexistent/skill',
        }),
      })

      expect(res.status).toBe(400)
      const json = await res.json()
      expect(json.error).toContain('does not exist')
    })

    it('should handle copy errors', async () => {
      mockStat.mockResolvedValue({ isDirectory: () => true })
      mockCp.mockRejectedValue(new Error('Copy failed'))

      const res = await app.request('/api/skills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourcePath: '/source/skill',
        }),
      })

      expect(res.status).toBe(500)
      const json = await res.json()
      expect(json.error).toBeDefined()
    })
  })

  describe('DELETE /api/skills/:name', () => {
    it('should delete skill directory', async () => {
      mockStat.mockResolvedValue({ isDirectory: () => true })
      mockRm.mockResolvedValue(undefined)

      const res = await app.request('/api/skills/test-skill', {
        method: 'DELETE',
      })

      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.success).toBe(true)
      expect(json.name).toBe('test-skill')
      expect(mockRm).toHaveBeenCalledWith(
        '/mock/home/.claude/skills/test-skill',
        { recursive: true, force: true }
      )
    })

    it('should return 404 if skill does not exist', async () => {
      mockStat.mockRejectedValue(new Error('ENOENT'))

      const res = await app.request('/api/skills/nonexistent', {
        method: 'DELETE',
      })

      expect(res.status).toBe(404)
      const json = await res.json()
      expect(json.error).toBe('Skill not found')
    })

    it('should handle deletion errors', async () => {
      mockStat.mockResolvedValue({ isDirectory: () => true })
      mockRm.mockRejectedValue(new Error('Permission denied'))

      const res = await app.request('/api/skills/test-skill', {
        method: 'DELETE',
      })

      expect(res.status).toBe(500)
      const json = await res.json()
      expect(json.error).toBeDefined()
    })
  })
})
