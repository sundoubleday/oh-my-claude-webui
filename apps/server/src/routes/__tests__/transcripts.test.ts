import { describe, it, expect, beforeEach, mock } from 'bun:test'
import { Hono } from 'hono'

// Mock fs/promises and path
const mockReaddir = mock()
const mockReadFile = mock()
const mockStat = mock()
const mockHomedir = mock(() => '/mock/home')

mock.module('fs/promises', () => ({
  readdir: mockReaddir,
  readFile: mockReadFile,
  stat: mockStat,
}))

mock.module('os', () => ({
  homedir: mockHomedir,
}))

// Now import the routes
import transcriptsRoutes from '../transcripts'

const app = new Hono()
app.route('/api/transcripts', transcriptsRoutes)

describe('Transcripts API', () => {
  beforeEach(() => {
    mockReaddir.mockClear()
    mockReadFile.mockClear()
    mockStat.mockClear()
    mockHomedir.mockClear()
  })

  describe('GET /api/transcripts', () => {
    it('should return empty array when no transcripts exist', async () => {
      mockReaddir.mockResolvedValue([])

      const res = await app.request('/api/transcripts')
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json).toEqual([])
    })

    it('should return list of transcripts with metadata', async () => {
      // Mock readdir to return transcript files
      mockReaddir.mockResolvedValue([
        'ses_abc123.jsonl',
        'ses_def456.jsonl',
        'not_a_session.txt', // Should be ignored
      ])

      // Mock readFile for first and last line parsing
      const transcript1 = `{"type":"user","timestamp":"2026-02-06T08:00:00.000Z","content":"First message"}
{"type":"assistant","timestamp":"2026-02-06T08:01:00.000Z","content":"Response"}
{"type":"user","timestamp":"2026-02-06T08:02:00.000Z","content":"Last message"}`

      const transcript2 = `{"type":"user","timestamp":"2026-02-05T10:00:00.000Z","content":"Another session"}`

      mockReadFile
        .mockResolvedValueOnce(transcript1) // ses_abc123.jsonl
        .mockResolvedValueOnce(transcript2) // ses_def456.jsonl

      const res = await app.request('/api/transcripts')
      expect(res.status).toBe(200)
      const json = await res.json()
      
      expect(json).toHaveLength(2)
      expect(json[0]).toEqual({
        sessionId: 'ses_abc123',
        messageCount: 3,
        firstMessageTime: '2026-02-06T08:00:00.000Z',
        lastMessageTime: '2026-02-06T08:02:00.000Z',
      })
      expect(json[1]).toEqual({
        sessionId: 'ses_def456',
        messageCount: 1,
        firstMessageTime: '2026-02-05T10:00:00.000Z',
        lastMessageTime: '2026-02-05T10:00:00.000Z',
      })
    })

    it('should handle file read errors gracefully', async () => {
      mockReaddir.mockResolvedValue(['ses_error.jsonl'])
      mockReadFile.mockRejectedValue(new Error('ENOENT'))

      const res = await app.request('/api/transcripts')
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json).toEqual([]) // Skip errored files
    })

    it('should handle corrupted JSONL gracefully', async () => {
      mockReaddir.mockResolvedValue(['ses_corrupted.jsonl'])
      mockReadFile.mockResolvedValue('invalid json\n{"type":"user","timestamp":"2026-02-06T08:00:00.000Z"}')

      const res = await app.request('/api/transcripts')
      expect(res.status).toBe(200)
      const json = await res.json()
      // Should still parse the valid line
      expect(json).toHaveLength(1)
      expect(json[0].sessionId).toBe('ses_corrupted')
    })
  })

  describe('GET /api/transcripts/:sessionId', () => {
    it('should return full transcript content', async () => {
      const mockContent = `{"type":"user","timestamp":"2026-02-06T08:00:00.000Z","content":"Hello"}
{"type":"assistant","timestamp":"2026-02-06T08:01:00.000Z","content":"Hi there"}
{"type":"tool_use","timestamp":"2026-02-06T08:02:00.000Z","tool_name":"read","tool_input":{"filePath":"test.ts"}}
{"type":"tool_result","timestamp":"2026-02-06T08:03:00.000Z","tool_name":"read","tool_output":{"content":"file content"}}`

      mockReadFile.mockResolvedValue(mockContent)

      const res = await app.request('/api/transcripts/ses_abc123')
      expect(res.status).toBe(200)
      const json = await res.json()
      
      expect(json.sessionId).toBe('ses_abc123')
      expect(json.messages).toHaveLength(4)
      expect(json.messages[0]).toEqual({
        type: 'user',
        timestamp: '2026-02-06T08:00:00.000Z',
        content: 'Hello',
      })
      expect(json.messages[2]).toEqual({
        type: 'tool_use',
        timestamp: '2026-02-06T08:02:00.000Z',
        tool_name: 'read',
        tool_input: { filePath: 'test.ts' },
      })
    })

    it('should skip corrupted lines and log warning', async () => {
      const mockContent = `{"type":"user","timestamp":"2026-02-06T08:00:00.000Z","content":"Valid"}
corrupted json here
{"type":"assistant","timestamp":"2026-02-06T08:01:00.000Z","content":"Also valid"}
{invalid
{"type":"user","timestamp":"2026-02-06T08:02:00.000Z","content":"Last valid"}`

      mockReadFile.mockResolvedValue(mockContent)

      const res = await app.request('/api/transcripts/ses_test')
      expect(res.status).toBe(200)
      const json = await res.json()
      
      expect(json.messages).toHaveLength(3) // Should skip 2 corrupted lines
      expect(json.messages[0].content).toBe('Valid')
      expect(json.messages[1].content).toBe('Also valid')
      expect(json.messages[2].content).toBe('Last valid')
    })

    it('should return 404 when transcript not found', async () => {
      mockReadFile.mockRejectedValue({ code: 'ENOENT' })

      const res = await app.request('/api/transcripts/ses_nonexistent')
      expect(res.status).toBe(404)
      const json = await res.json()
      expect(json.error).toBe('Transcript not found')
    })

    it('should return 500 on unexpected errors', async () => {
      mockReadFile.mockRejectedValue(new Error('Unknown error'))

      const res = await app.request('/api/transcripts/ses_error')
      expect(res.status).toBe(500)
      const json = await res.json()
      expect(json.error).toBe('Failed to read transcript')
    })

    it('should handle empty transcript files', async () => {
      mockReadFile.mockResolvedValue('')

      const res = await app.request('/api/transcripts/ses_empty')
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.sessionId).toBe('ses_empty')
      expect(json.messages).toEqual([])
    })
  })
})
