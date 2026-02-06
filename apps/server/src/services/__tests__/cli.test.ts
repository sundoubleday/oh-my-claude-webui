import { describe, it, expect, beforeEach, afterEach, mock, spyOn } from 'bun:test'
import { EventEmitter } from 'events'

// Mock child_process before importing CLIService
const mockStdin = {
  write: mock(() => true),
  end: mock(() => {}),
}

const mockStdout = new EventEmitter()
const mockStderr = new EventEmitter()

const mockProcess = Object.assign(new EventEmitter(), {
  stdin: mockStdin,
  stdout: mockStdout,
  stderr: mockStderr,
  pid: 12345,
  kill: mock(() => true),
})

const mockSpawn = mock(() => mockProcess)

mock.module('child_process', () => ({
  spawn: mockSpawn,
}))

// Import after mocking
import { CLIService, CLIServiceError } from '../cli'

describe('CLIService', () => {
  let service: CLIService

  beforeEach(() => {
    service = new CLIService()
    mockSpawn.mockClear()
    mockStdin.write.mockClear()
    mockProcess.kill.mockClear()
  })

  afterEach(async () => {
    await service.stop()
  })

  describe('start()', () => {
    it('should spawn claude process with correct arguments', async () => {
      await service.start('test-session-id')

      expect(mockSpawn).toHaveBeenCalledTimes(1)
      const [cmd, args, options] = mockSpawn.mock.calls[0]
      
      expect(cmd).toBe('claude')
      expect(args).toContain('--session-id')
      expect(args).toContain('test-session-id')
      expect(args).toContain('--output-format')
      expect(args).toContain('stream-json')
      expect(options.shell).toBe(true)
      expect(options.stdio).toEqual(['pipe', 'pipe', 'pipe'])
    })

    it('should generate UUID if no session ID provided', async () => {
      await service.start()

      const [, args] = mockSpawn.mock.calls[0]
      const sessionIdIndex = args.indexOf('--session-id') + 1
      const sessionId = args[sessionIdIndex]
      
      // UUID format check
      expect(sessionId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
    })

    it('should throw if already started', async () => {
      await service.start()
      
      await expect(service.start()).rejects.toThrow(CLIServiceError)
    })

    it('should emit ready event when process starts', async () => {
      const readyHandler = mock(() => {})
      service.on('ready', readyHandler)

      await service.start()

      expect(readyHandler).toHaveBeenCalledTimes(1)
    })
  })

  describe('sendMessage()', () => {
    it('should write formatted JSON to stdin', async () => {
      await service.start()
      
      await service.sendMessage('Hello, Claude!')

      expect(mockStdin.write).toHaveBeenCalledTimes(1)
      const writtenData = mockStdin.write.mock.calls[0][0]
      const parsed = JSON.parse(writtenData.replace('\n', ''))
      
      expect(parsed).toEqual({
        type: 'user',
        message: { role: 'user', content: 'Hello, Claude!' }
      })
    })

    it('should throw if process not started', async () => {
      await expect(service.sendMessage('test')).rejects.toThrow(CLIServiceError)
    })

    it('should reset response timeout on send', async () => {
      await service.start()
      
      const timeoutHandler = mock(() => {})
      service.on('timeout', timeoutHandler)
      
      await service.sendMessage('test')
      
      // Timeout should not fire immediately
      expect(timeoutHandler).not.toHaveBeenCalled()
    })
  })

  describe('stdout parsing', () => {
    it('should emit message events for valid JSON lines', async () => {
      const messageHandler = mock(() => {})
      service.on('message', messageHandler)

      await service.start()

      const testMessage = { type: 'assistant', message: { content: 'Hello!' } }
      mockStdout.emit('data', Buffer.from(JSON.stringify(testMessage) + '\n'))

      expect(messageHandler).toHaveBeenCalledWith(testMessage)
    })

    it('should handle multiple JSON lines in single chunk', async () => {
      const messageHandler = mock(() => {})
      service.on('message', messageHandler)

      await service.start()

      const msg1 = { type: 'assistant', message: { content: 'Line 1' } }
      const msg2 = { type: 'result', data: {} }
      const chunk = JSON.stringify(msg1) + '\n' + JSON.stringify(msg2) + '\n'
      
      mockStdout.emit('data', Buffer.from(chunk))

      expect(messageHandler).toHaveBeenCalledTimes(2)
      expect(messageHandler).toHaveBeenNthCalledWith(1, msg1)
      expect(messageHandler).toHaveBeenNthCalledWith(2, msg2)
    })

    it('should emit raw event for non-JSON lines', async () => {
      const rawHandler = mock(() => {})
      service.on('raw', rawHandler)

      await service.start()

      mockStdout.emit('data', Buffer.from('not valid json\n'))

      expect(rawHandler).toHaveBeenCalledWith('not valid json')
    })

    it('should handle partial JSON across chunks (buffer)', async () => {
      const messageHandler = mock(() => {})
      service.on('message', messageHandler)

      await service.start()

      const fullMessage = { type: 'assistant', message: { content: 'Complete message' } }
      const jsonStr = JSON.stringify(fullMessage)
      
      // Send in two parts
      mockStdout.emit('data', Buffer.from(jsonStr.substring(0, 20)))
      expect(messageHandler).not.toHaveBeenCalled()
      
      mockStdout.emit('data', Buffer.from(jsonStr.substring(20) + '\n'))
      expect(messageHandler).toHaveBeenCalledWith(fullMessage)
    })
  })

  describe('stderr handling', () => {
    it('should emit error events for stderr output', async () => {
      const errorHandler = mock(() => {})
      service.on('error', errorHandler)

      await service.start()

      mockStderr.emit('data', Buffer.from('Some error occurred'))

      expect(errorHandler).toHaveBeenCalledWith('Some error occurred')
    })
  })

  describe('process exit', () => {
    it('should emit exit event with code', async () => {
      const exitHandler = mock(() => {})
      service.on('exit', exitHandler)

      await service.start()
      mockProcess.emit('exit', 0)

      expect(exitHandler).toHaveBeenCalledWith(0)
    })

    it('should clear process reference on exit', async () => {
      await service.start()
      expect(service.isRunning()).toBe(true)
      
      mockProcess.emit('exit', 0)
      
      expect(service.isRunning()).toBe(false)
    })
  })

  describe('stop()', () => {
    it('should kill process with SIGTERM', async () => {
      await service.start()
      await service.stop()

      expect(mockProcess.kill).toHaveBeenCalledWith('SIGTERM')
    })

    it('should be idempotent (safe to call multiple times)', async () => {
      await service.start()
      await service.stop()
      await service.stop() // Should not throw

      expect(mockProcess.kill).toHaveBeenCalledTimes(1)
    })

    it('should clear timeout on stop', async () => {
      await service.start()
      await service.sendMessage('test')
      await service.stop()

      // Timeout should be cleared - no timeout event
      const timeoutHandler = mock(() => {})
      service.on('timeout', timeoutHandler)
      
      // Wait a bit to ensure no timeout fires
      await new Promise(resolve => setTimeout(resolve, 100))
      expect(timeoutHandler).not.toHaveBeenCalled()
    })
  })

  describe('timeout', () => {
    it('should emit timeout event after 60 seconds of no response', async () => {
      // Use a shorter timeout for testing
      service = new CLIService({ timeoutMs: 100 })
      
      const timeoutHandler = mock(() => {})
      service.on('timeout', timeoutHandler)

      await service.start()
      await service.sendMessage('test')

      // Wait for timeout
      await new Promise(resolve => setTimeout(resolve, 150))

      expect(timeoutHandler).toHaveBeenCalledTimes(1)
    })

    it('should reset timeout when receiving message', async () => {
      service = new CLIService({ timeoutMs: 100 })
      
      const timeoutHandler = mock(() => {})
      service.on('timeout', timeoutHandler)

      await service.start()
      await service.sendMessage('test')

      // Simulate response before timeout
      await new Promise(resolve => setTimeout(resolve, 50))
      mockStdout.emit('data', Buffer.from('{"type":"assistant"}\n'))

      // Wait past original timeout
      await new Promise(resolve => setTimeout(resolve, 100))

      // Timeout should not have fired since we got a response
      expect(timeoutHandler).not.toHaveBeenCalled()
    })
  })

  describe('getSessionId()', () => {
    it('should return current session ID', async () => {
      await service.start('my-session')
      expect(service.getSessionId()).toBe('my-session')
    })

    it('should return null when not started', () => {
      expect(service.getSessionId()).toBeNull()
    })
  })
})
