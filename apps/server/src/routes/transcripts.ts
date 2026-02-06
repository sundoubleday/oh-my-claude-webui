import { Hono } from 'hono'
import { readdir, readFile } from 'fs/promises'
import { homedir } from 'os'
import { join } from 'path'

const transcripts = new Hono()

// TranscriptLine types
type TranscriptLine = 
  | { type: 'user', timestamp: string, content: string }
  | { type: 'assistant', timestamp: string, content: string }
  | { type: 'tool_use', timestamp: string, tool_name: string, tool_input: object }
  | { type: 'tool_result', timestamp: string, tool_name: string, tool_output: object }

interface TranscriptMetadata {
  sessionId: string
  messageCount: number
  firstMessageTime: string
  lastMessageTime: string
}

interface TranscriptContent {
  sessionId: string
  messages: TranscriptLine[]
}

// Helper: Get transcripts directory path
function getTranscriptsDir(): string {
  return join(homedir(), '.claude', 'transcripts')
}

// Helper: Parse JSONL content
function parseJSONL(content: string): TranscriptLine[] {
  const lines = content.split('\n').filter(line => line.trim())
  const messages: TranscriptLine[] = []
  
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

// Helper: Extract metadata from JSONL file
async function extractMetadata(filePath: string, sessionId: string): Promise<TranscriptMetadata | null> {
  try {
    const content = await readFile(filePath, 'utf-8')
    const messages = parseJSONL(content)
    
    if (messages.length === 0) {
      return {
        sessionId,
        messageCount: 0,
        firstMessageTime: '',
        lastMessageTime: '',
      }
    }
    
    return {
      sessionId,
      messageCount: messages.length,
      firstMessageTime: messages[0].timestamp,
      lastMessageTime: messages[messages.length - 1].timestamp,
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
    // Filter out failed extractions
    const validMetadata = allMetadata.filter((m): m is TranscriptMetadata => m !== null)
    
    return c.json(validMetadata)
  } catch (error) {
    console.error('Failed to list transcripts:', error)
    return c.json({ error: 'Failed to list transcripts' }, 500)
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
        return c.json({ error: 'Transcript not found' }, 404)
      }
      throw error
    }
    
    const messages = parseJSONL(content)
    
    const result: TranscriptContent = {
      sessionId,
      messages,
    }
    
    return c.json(result)
  } catch (error) {
    console.error('Failed to read transcript:', error)
    return c.json({ error: 'Failed to read transcript' }, 500)
  }
})

export default transcripts
