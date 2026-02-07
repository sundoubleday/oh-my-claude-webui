import { Hono } from 'hono'
import { readdir, readFile, unlink } from 'fs/promises'
import { homedir } from 'os'
import { join } from 'path'

const transcripts = new Hono()

// Raw transcript line (as stored in JSONL)
interface RawTranscriptLine {
  type: string
  subtype?: string
  timestamp?: string
  content?: string
  message?: {
    role?: string
    content?: string | Array<{ type: string; text?: string }>
  }
  result?: string
  tool_name?: string
  tool_input?: object
  tool_output?: object
  [key: string]: unknown
}

// Simplified message for frontend display
interface DisplayMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: string
}

interface TranscriptMetadata {
  sessionId: string
  messageCount: number
  firstMessageTime: string
  lastMessageTime: string
}

interface TranscriptContent {
  sessionId: string
  messages: DisplayMessage[]
}

// Helper: Get transcripts directory path
function getTranscriptsDir(): string {
  return join(homedir(), '.claude', 'transcripts')
}

// Helper: Parse JSONL content
function parseJSONL(content: string): RawTranscriptLine[] {
  const lines = content.split('\n').filter(line => line.trim())
  const messages: RawTranscriptLine[] = []
  
  for (const line of lines) {
    try {
      const parsed = JSON.parse(line)
      messages.push(parsed)
    } catch (error) {
      console.warn(`Skipping corrupted JSONL line: ${line.substring(0, 50)}...`)
    }
  }
  
  return messages
}

// Helper: Extract text content from message
function extractContent(msg: RawTranscriptLine): string | null {
  // Direct content field
  if (typeof msg.content === 'string') {
    return cleanContent(msg.content)
  }
  
  // Result field (from result type)
  if (typeof msg.result === 'string') {
    return cleanContent(msg.result)
  }
  
  // Message object with content
  if (msg.message?.content) {
    const content = msg.message.content
    if (typeof content === 'string') {
      return cleanContent(content)
    }
    // Array of content blocks
    if (Array.isArray(content)) {
      const text = content
        .filter(block => block.type === 'text' && block.text)
        .map(block => block.text)
        .join('\n')
      return text ? cleanContent(text) : null
    }
  }
  
  return null
}

// Helper: Clean content - remove [Pasted ~N lines] and similar patterns
function cleanContent(content: string): string {
  return content
    // Remove [Pasted ~N lines] pattern (various formats)
    .replace(/\[Pasted\s*~?\s*\d+\s*lines?\s*\]/gi, '')
    // Remove [Pasted ~N chars] pattern
    .replace(/\[Pasted\s*~?\s*\d+\s*chars?\s*\]/gi, '')
    // Remove extra whitespace
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// Helper: Convert raw lines to display messages
function toDisplayMessages(rawLines: RawTranscriptLine[]): DisplayMessage[] {
  const messages: DisplayMessage[] = []
  
  for (const line of rawLines) {
    // User message
    if (line.type === 'user') {
      const content = extractContent(line)
      if (content) {
        messages.push({
          role: 'user',
          content,
          timestamp: line.timestamp || new Date().toISOString(),
        })
      }
    }
    
    // Assistant message
    if (line.type === 'assistant') {
      const content = extractContent(line)
      if (content) {
        messages.push({
          role: 'assistant',
          content,
          timestamp: line.timestamp || new Date().toISOString(),
        })
      }
    }
    
    // Result message (final response)
    if (line.type === 'result' && line.subtype === 'success') {
      const content = extractContent(line)
      if (content) {
        // Check if we already have this content from assistant message
        const lastMsg = messages[messages.length - 1]
        if (!lastMsg || lastMsg.role !== 'assistant' || lastMsg.content !== content) {
          messages.push({
            role: 'assistant',
            content,
            timestamp: line.timestamp || new Date().toISOString(),
          })
        }
      }
    }
  }
  
  return messages
}

// Helper: Extract metadata from JSONL file
async function extractMetadata(filePath: string, sessionId: string): Promise<TranscriptMetadata | null> {
  try {
    const content = await readFile(filePath, 'utf-8')
    const rawLines = parseJSONL(content)
    const displayMessages = toDisplayMessages(rawLines)
    
    if (displayMessages.length === 0) {
      return {
        sessionId,
        messageCount: 0,
        firstMessageTime: '',
        lastMessageTime: '',
      }
    }
    
    return {
      sessionId,
      messageCount: displayMessages.length,
      firstMessageTime: displayMessages[0].timestamp,
      lastMessageTime: displayMessages[displayMessages.length - 1].timestamp,
    }
  } catch (error) {
    console.error(`Failed to extract metadata for ${sessionId}:`, error)
    return null
  }
}

// GET /api/transcripts - Retrieve transcript list
transcripts.get('/', async (c) => {
  try {
    const transcriptsDir = getTranscriptsDir()
    
    let files: string[]
    
    try {
      files = await readdir(transcriptsDir)
    } catch (error) {
      // Directory doesn't exist or can't be read
      return c.json([])
    }
    
    // Filter only .jsonl files with session ID pattern
    const sessionFiles = files.filter(f => f.startsWith('ses_') && f.endsWith('.jsonl'))
    
    // Extract metadata for each file
    const metadataPromises = sessionFiles.map(async (filename) => {
      const sessionId = filename.replace('.jsonl', '')
      const filePath = join(transcriptsDir, filename)
      return extractMetadata(filePath, sessionId)
    })
    
    const allMetadata = await Promise.all(metadataPromises)
    // Filter out failed extractions and empty sessions
    const validMetadata = allMetadata
      .filter((m): m is TranscriptMetadata => m !== null && m.messageCount > 0)
      .sort((a, b) => new Date(b.lastMessageTime).getTime() - new Date(a.lastMessageTime).getTime())
    
    return c.json(validMetadata)
  } catch (error) {
    console.error('Failed to list transcripts:', error)
    return c.json({ error: 'Failed to list transcripts', code: 500 }, 500)
  }
})

// GET /api/transcripts/:sessionId - Retrieve single transcript
transcripts.get('/:sessionId', async (c) => {
  try {
    const sessionId = c.req.param('sessionId')
    const transcriptsDir = getTranscriptsDir()
    const filePath = join(transcriptsDir, `${sessionId}.jsonl`)
    
    let content: string
    try {
      content = await readFile(filePath, 'utf-8')
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return c.json({ error: 'Transcript not found', code: 404 }, 404)
      }
      throw error
    }
    
    const rawLines = parseJSONL(content)
    const displayMessages = toDisplayMessages(rawLines)
    
    const result: TranscriptContent = {
      sessionId,
      messages: displayMessages,
    }
    
    return c.json(result)
  } catch (error) {
    console.error('Failed to read transcript:', error)
    return c.json({ error: 'Failed to read transcript', code: 500 }, 500)
  }
})

// DELETE /api/transcripts/:sessionId - Delete a transcript
transcripts.delete('/:sessionId', async (c) => {
  try {
    const sessionId = c.req.param('sessionId')
    const transcriptsDir = getTranscriptsDir()
    const filePath = join(transcriptsDir, `${sessionId}.jsonl`)
    
    try {
      await unlink(filePath)
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return c.json({ error: 'Transcript not found', code: 404 }, 404)
      }
      throw error
    }
    
    return c.json({ success: true, sessionId })
  } catch (error) {
    console.error('Failed to delete transcript:', error)
    return c.json({ error: 'Failed to delete transcript', code: 500 }, 500)
  }
})

export default transcripts
