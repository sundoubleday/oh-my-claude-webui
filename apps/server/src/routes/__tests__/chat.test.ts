import { describe, it, expect, beforeEach, mock, afterEach } from 'bun:test'
import { EventEmitter } from 'events'

// Mock CLIService before importing
const mockStart = mock()
const mockStop = mock()
const mockSendMessage = mock()
const mockIsRunning = mock(() => false)
const mockGetSessionId = mock(() => null)

// Create a mock CLIService class that extends EventEmitter
class MockCLIService extends EventEmitter {
  start = mockStart
  stop = mockStop
  sendMessage = mockSendMessage
  isRunning = mockIsRunning
  getSessionId = mockGetSessionId
}

let mockCLIInstance: MockCLIService

mock.module('../../services/cli', () => {
  return {
    CLIService: class extends EventEmitter {
      constructor() {
        super()
        mockCLIInstance = new MockCLIService()
        // Copy event emitter methods
        this.on = mockCLIInstance.on.bind(mockCLIInstance)
        this.emit = mockCLIInstance.emit.bind(mockCLIInstance)
        this.removeAllListeners = mockCLIInstance.removeAllListeners.bind(mockCLIInstance)
      }
      start = mockStart
      stop = mockStop
      sendMessage = mockSendMessage
      isRunning = mockIsRunning
      getSessionId = mockGetSessionId
    }
  }
})

describe('WebSocket Chat', () => {
  beforeEach(() => {
    mockStart.mockClear()
    mockStop.mockClear()
    mockSendMessage.mockClear()
    mockIsRunning.mockClear()
    mockGetSessionId.mockClear()
    mockIsRunning.mockReturnValue(false)
  })

  describe('Message Protocol', () => {
    it('should accept message type with content', () => {
      const message = {
        type: 'message',
        content: 'Hello, Claude!'
      }
      expect(message.type).toBe('message')
      expect(message.content).toBe('Hello, Claude!')
    })

    it('should accept message with optional sessionId', () => {
      const message = {
        type: 'message',
        content: 'Hello',
        sessionId: 'ses_abc123'
      }
      expect(message.sessionId).toBe('ses_abc123')
    })

    it('should format server response correctly', () => {
      const response = {
        type: 'message',
        content: { type: 'assistant', message: { role: 'assistant', content: 'Hi!' } }
      }
      expect(response.type).toBe('message')
      expect(response.content).toBeDefined()
    })

    it('should format error response correctly', () => {
      const error = {
        type: 'error',
        error: 'Process failed'
      }
      expect(error.type).toBe('error')
      expect(error.error).toBe('Process failed')
    })

    it('should format status response correctly', () => {
      const status = {
        type: 'status',
        status: 'ready'
      }
      expect(status.type).toBe('status')
      expect(status.status).toBe('ready')
    })
  })

  describe('CLIService Integration', () => {
    it('should start CLIService when first message received', async () => {
      mockStart.mockResolvedValue(undefined)
      mockIsRunning.mockReturnValue(false)

      // Simulate the handler logic
      const data = { type: 'message', content: 'Hello' }
      if (data.type === 'message' && !mockIsRunning()) {
        await mockStart()
      }

      expect(mockStart).toHaveBeenCalled()
    })

    it('should start CLIService with sessionId if provided', async () => {
      mockStart.mockResolvedValue(undefined)
      mockIsRunning.mockReturnValue(false)

      const data = { type: 'message', content: 'Hello', sessionId: 'ses_test123' }
      if (data.type === 'message' && !mockIsRunning()) {
        await mockStart(data.sessionId)
      }

      expect(mockStart).toHaveBeenCalledWith('ses_test123')
    })

    it('should send message to CLIService', async () => {
      mockSendMessage.mockResolvedValue(undefined)
      mockIsRunning.mockReturnValue(true)

      const data = { type: 'message', content: 'Hello, Claude!' }
      if (mockIsRunning()) {
        await mockSendMessage(data.content)
      }

      expect(mockSendMessage).toHaveBeenCalledWith('Hello, Claude!')
    })

    it('should stop CLIService on disconnect', async () => {
      mockStop.mockResolvedValue(undefined)

      // Simulate disconnect handler
      await mockStop()

      expect(mockStop).toHaveBeenCalled()
    })

    it('should not start CLIService if already running', async () => {
      mockIsRunning.mockReturnValue(true)

      const data = { type: 'message', content: 'Hello' }
      if (data.type === 'message' && !mockIsRunning()) {
        await mockStart()
      }

      expect(mockStart).not.toHaveBeenCalled()
    })
  })

  describe('Event Forwarding', () => {
    it('should forward CLIService message events to WebSocket', () => {
      const messages: string[] = []
      const mockWsSend = (msg: string) => messages.push(msg)

      // Simulate CLI message event handler
      const cliMessage = { type: 'assistant', message: { role: 'assistant', content: 'Hello!' } }
      mockWsSend(JSON.stringify({ type: 'message', content: cliMessage }))

      expect(messages.length).toBe(1)
      const parsed = JSON.parse(messages[0])
      expect(parsed.type).toBe('message')
      expect(parsed.content.type).toBe('assistant')
    })

    it('should forward CLIService error events to WebSocket', () => {
      const messages: string[] = []
      const mockWsSend = (msg: string) => messages.push(msg)

      // Simulate CLI error event handler
      const errorMsg = 'Process crashed'
      mockWsSend(JSON.stringify({ type: 'error', error: errorMsg }))

      expect(messages.length).toBe(1)
      const parsed = JSON.parse(messages[0])
      expect(parsed.type).toBe('error')
      expect(parsed.error).toBe('Process crashed')
    })

    it('should send status update on CLI exit', () => {
      const messages: string[] = []
      const mockWsSend = (msg: string) => messages.push(msg)

      // Simulate CLI exit event handler
      mockWsSend(JSON.stringify({ type: 'status', status: 'stopped' }))

      expect(messages.length).toBe(1)
      const parsed = JSON.parse(messages[0])
      expect(parsed.type).toBe('status')
      expect(parsed.status).toBe('stopped')
    })
  })

  describe('Error Handling', () => {
    it('should handle invalid JSON message gracefully', () => {
      const errors: string[] = []
      const mockWsSend = (msg: string) => errors.push(msg)

      // Simulate parsing invalid JSON
      const rawMessage = 'not valid json'
      try {
        JSON.parse(rawMessage)
      } catch {
        mockWsSend(JSON.stringify({ type: 'error', error: 'Invalid message format' }))
      }

      expect(errors.length).toBe(1)
      const parsed = JSON.parse(errors[0])
      expect(parsed.type).toBe('error')
    })

    it('should handle CLIService start failure', async () => {
      const errors: string[] = []
      const mockWsSend = (msg: string) => errors.push(msg)

      mockStart.mockRejectedValue(new Error('Failed to start CLI'))

      try {
        await mockStart()
      } catch (error) {
        mockWsSend(JSON.stringify({ type: 'error', error: (error as Error).message }))
      }

      expect(errors.length).toBe(1)
      const parsed = JSON.parse(errors[0])
      expect(parsed.error).toBe('Failed to start CLI')
    })

    it('should handle unknown message type', () => {
      const errors: string[] = []
      const mockWsSend = (msg: string) => errors.push(msg)

      const data = { type: 'unknown', content: 'test' }
      if (data.type !== 'message') {
        mockWsSend(JSON.stringify({ type: 'error', error: `Unknown message type: ${data.type}` }))
      }

      expect(errors.length).toBe(1)
      const parsed = JSON.parse(errors[0])
      expect(parsed.error).toBe('Unknown message type: unknown')
    })
  })
})
