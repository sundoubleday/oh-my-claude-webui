import { Hono } from 'hono'
import { readdir, readFile, unlink, stat } from 'fs/promises'
import { homedir } from 'os'
import { join } from 'path'

const transcripts = new Hono()

// Helper: Get projects directory path
function getProjectsDir(): string {
  return join(homedir(), '.claude', 'projects')
}

// Raw message line from Claude Code projects (as stored in JSONL)
interface RawProjectLine {
  type: string
  subtype?: string
  timestamp?: string
  uuid?: string
  sessionId?: string
  cwd?: string
  // User message format
  content?: string
  message?: {
    role?: string
    content?: string | Array<{ type: string; text?: string }>
  }
  // For filtering out non-conversation entries
  data?: unknown
  [key: string]: unknown
}

// Simplified message for frontend display
interface DisplayMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: string
}

interface SessionInfo {
  sessionId: string  // UUID format from projects
  projectDir: string // Directory name (e.g., "E--Vibe-Coding-Open-Code-project")
  projectPath: string // Readable path (e.g., "E:\Vibe Coding\Open Code\project")
}

interface TranscriptMetadata extends SessionInfo {
  messageCount: number
  firstMessageTime: string
  lastMessageTime: string
  title?: string // First user message or summary
}

interface TranscriptContent extends SessionInfo {
  messages: DisplayMessage[]
}

// Helper: Convert project directory name to readable path
// E--Vibe-Coding-Open-Code-project -> E:\Vibe-Coding-Open-Code-project
function dirNameToPath(dirName: string): string {
  return dirName
    .replace(/^([A-Za-z])--/, '$1:\\')
    .replace(/--/g, '\\')
}

// Helper: Parse JSONL content
function parseJSONL(content: string): RawProjectLine[] {
  const lines = content.split('\n').filter(line => line.trim())
  const messages: RawProjectLine[] = []
  
  for (const line of lines) {
    try {
      const parsed = JSON.parse(line)
      messages.push(parsed)
    } catch (error) {
      // Skip corrupted lines silently
    }
  }
  
  return messages
}

// Helper: Extract metadata from JSONL file
async function extractMetadata(
  filePath: string, 
  sessionInfo: SessionInfo
): Promise<TranscriptMetadata | null> {
  try {
    const content = await readFile(filePath, 'utf-8')
    const rawLines = parseJSONL(content)
    const displayMessages = toDisplayMessages(rawLines)
    
    if (displayMessages.length === 0) {
      console.log(`[Metadata] Empty display messages for ${sessionInfo.sessionId}`)
      return null // Skip empty sessions
    }
    
    // Extract title from first user message
    const firstUserMsg = displayMessages.find(m => m.role === 'user')
    // Fallback title logic: Use first message content, or "New Conversation"
    let title = 'New Conversation'
    if (firstUserMsg && firstUserMsg.content) {
      title = firstUserMsg.content.slice(0, 100) + (firstUserMsg.content.length > 100 ? '...' : '')
    } else if (displayMessages.length > 0) {
      // If no user message, maybe it started with assistant (rare)
      title = `Conversation ${sessionInfo.sessionId.slice(0, 8)}`
    }
    
    return {
      ...sessionInfo,
      messageCount: displayMessages.length,
      firstMessageTime: displayMessages[0].timestamp,
      lastMessageTime: displayMessages[displayMessages.length - 1].timestamp,
      title
    }
  } catch (error) {
    console.error(`Failed to extract metadata for ${sessionInfo.sessionId}:`, error)
    return null
  }
}

// Helper: Extract text content from message
function extractContent(msg: RawProjectLine): string | null {
  // Direct content field (user messages in old format)
  if (typeof msg.content === 'string' && msg.content.trim()) {
    return cleanContent(msg.content)
  }
  
  // Message object with content (new format)
  if (msg.message?.content) {
    const content = msg.message.content
    if (typeof content === 'string' && content.trim()) {
      return cleanContent(content)
    }
    // Array of content blocks (Claude response format)
    if (Array.isArray(content)) {
      const textParts = content
        .filter(block => block.type === 'text' && block.text)
        .map(block => block.text as string)
      const text = textParts.join('\n')
      return text.trim() ? cleanContent(text) : null
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
function toDisplayMessages(rawLines: RawProjectLine[]): DisplayMessage[] {
  const messages: DisplayMessage[] = []
  
  for (const line of rawLines) {
    // Skip non-conversation entries (progress, queue-operation, etc.)
    if (line.data || line.type === 'progress' || line.type === 'queue-operation') {
      continue
    }
    
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
        // Avoid duplicate content from consecutive assistant messages
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

// Helper: List all sessions in a project directory
async function listProjectSessions(projectDir: string, projectDirName: string): Promise<SessionInfo[]> {
  const sessions: SessionInfo[] = []
  
  try {
    const entries = await readdir(projectDir)
    const jsonlFiles = entries.filter(f => f.endsWith('.jsonl') && !f.includes('memory'))
    
    for (const file of jsonlFiles) {
      const sessionId = file.replace('.jsonl', '')
      sessions.push({
        sessionId,
        projectDir: projectDirName,
        projectPath: dirNameToPath(projectDirName),
      })
    }
  } catch (error) {
    // Directory doesn't exist or can't be read
  }
  
  return sessions
}

// Helper: Extract metadata from JSONL file
async function extractMetadata(
  filePath: string, 
  sessionInfo: SessionInfo
): Promise<TranscriptMetadata | null> {
  try {
    const content = await readFile(filePath, 'utf-8')
    const rawLines = parseJSONL(content)
    const displayMessages = toDisplayMessages(rawLines)
    
    if (displayMessages.length === 0) {
      return null // Skip empty sessions
    }
    
    return {
      ...sessionInfo,
      messageCount: displayMessages.length,
      firstMessageTime: displayMessages[0].timestamp,
      lastMessageTime: displayMessages[displayMessages.length - 1].timestamp,
    }
  } catch (error) {
    console.error(`Failed to extract metadata for ${sessionInfo.sessionId}:`, error)
    return null
  }
}

// GET /api/transcripts - Retrieve transcript list from all projects
transcripts.get('/', async (c) => {
  try {
    const projectsDir = getProjectsDir()
    
    let projectDirs: string[]
    
    try {
      const entries = await readdir(projectsDir)
      // Filter only directories (project folders)
      const statPromises = entries.map(async (entry) => {
        try {
          const entryPath = join(projectsDir, entry)
          const entryStat = await stat(entryPath)
          return entryStat.isDirectory() ? entry : null
        } catch {
          return null
        }
      })
      const results = await Promise.all(statPromises)
      projectDirs = results.filter((d): d is string => d !== null)
    } catch (error) {
      // Directory doesn't exist or can't be read
      return c.json([])
    }
    
    // Get all sessions from all projects
    const allSessionsPromises = projectDirs.map(async (dirName) => {
      const projectPath = join(projectsDir, dirName)
      return listProjectSessions(projectPath, dirName)
    })
    
    const allSessionArrays = await Promise.all(allSessionsPromises)
    const allSessions = allSessionArrays.flat()
    
    // Extract metadata for each session
    const metadataPromises = allSessions.map(async (sessionInfo) => {
      const filePath = join(projectsDir, sessionInfo.projectDir, `${sessionInfo.sessionId}.jsonl`)
      return extractMetadata(filePath, sessionInfo)
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

// Helper: Check if session content matches query
async function searchSessionContent(
  filePath: string,
  query: string
): Promise<boolean> {
  try {
    const content = await readFile(filePath, 'utf-8')
    return content.toLowerCase().includes(query.toLowerCase())
  } catch {
    return false
  }
}

// GET /api/transcripts/search - Full text search across all sessions
transcripts.get('/search', async (c) => {
  const query = c.req.query('q')
  if (!query || query.length < 2) {
    return c.json([])
  }

  try {
    const projectsDir = getProjectsDir()
    let projectDirs: string[] = []
    
    try {
      const entries = await readdir(projectsDir)
      for (const entry of entries) {
        try {
          const entryPath = join(projectsDir, entry)
          const s = await stat(entryPath)
          if (s.isDirectory()) projectDirs.push(entry)
        } catch {}
      }
    } catch {
      return c.json([])
    }

    const results: TranscriptMetadata[] = []
    
    // Search in parallel across projects
    await Promise.all(projectDirs.map(async (dirName) => {
      const projectPath = join(projectsDir, dirName)
      try {
        const files = await readdir(projectPath)
        const jsonlFiles = files.filter(f => f.endsWith('.jsonl') && !f.includes('memory'))
        
        await Promise.all(jsonlFiles.map(async (file) => {
          const filePath = join(projectPath, file)
          const isMatch = await searchSessionContent(filePath, query)
          
          if (isMatch) {
            console.log(`[Search] Match found in ${file}`)
            const sessionId = file.replace('.jsonl', '')
            const sessionInfo = {
              sessionId,
              projectDir: dirName,
              projectPath: dirNameToPath(dirName)
            }
            try {
              const metadata = await extractMetadata(filePath, sessionInfo)
              if (metadata) {
                results.push(metadata)
              } else {
                console.warn(`[Search] Metadata extraction failed for ${file}`)
              }
            } catch (e) {
              console.error(`[Search] Error extracting metadata for ${file}:`, e)
            }
          }
        }))
      } catch (e) {
        console.error(`[Search] Error reading project ${dirName}:`, e)
      }
    }))

    return c.json(results.sort((a, b) => new Date(b.lastMessageTime).getTime() - new Date(a.lastMessageTime).getTime()))
  } catch (error) {
    console.error('Search failed:', error)
    return c.json({ error: 'Search failed' }, 500)
  }
})

// Helper: Find session across all projects by sessionId only
async function findSessionByIdOnly(sessionId: string): Promise<{ projectDir: string; filePath: string } | null> {
  const projectsDir = getProjectsDir()
  
  try {
    const entries = await readdir(projectsDir)
    
    for (const entry of entries) {
      try {
        const entryPath = join(projectsDir, entry)
        const entryStat = await stat(entryPath)
        if (!entryStat.isDirectory()) continue
        
        const sessionFile = join(entryPath, `${sessionId}.jsonl`)
        try {
          await stat(sessionFile)
          // Found it!
          return { projectDir: entry, filePath: sessionFile }
        } catch {
          // Not in this project, continue searching
        }
      } catch {
        // Skip invalid entries
      }
    }
  } catch {
    // Projects dir doesn't exist
  }
  
  return null
}

// GET /api/transcripts/by-session/:sessionId - Find and retrieve transcript by sessionId only (search all projects)
transcripts.get('/by-session/:sessionId', async (c) => {
  try {
    const sessionId = c.req.param('sessionId')
    
    const found = await findSessionByIdOnly(sessionId)
    if (!found) {
      return c.json({ error: 'Transcript not found', code: 404 }, 404)
    }
    
    const content = await readFile(found.filePath, 'utf-8')
    const rawLines = parseJSONL(content)
    const displayMessages = toDisplayMessages(rawLines)
    
    const result: TranscriptContent = {
      sessionId,
      projectDir: found.projectDir,
      projectPath: dirNameToPath(found.projectDir),
      messages: displayMessages,
    }
    
    return c.json(result)
  } catch (error) {
    console.error('Failed to read transcript:', error)
    return c.json({ error: 'Failed to read transcript', code: 500 }, 500)
  }
})

// GET /api/transcripts/:projectDir/:sessionId - Retrieve single transcript
transcripts.get('/:projectDir/:sessionId', async (c) => {
  try {
    const projectDir = c.req.param('projectDir')
    const sessionId = c.req.param('sessionId')
    const projectsDir = getProjectsDir()
    const filePath = join(projectsDir, projectDir, `${sessionId}.jsonl`)
    
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
      projectDir,
      projectPath: dirNameToPath(projectDir),
      messages: displayMessages,
    }
    
    return c.json(result)
  } catch (error) {
    console.error('Failed to read transcript:', error)
    return c.json({ error: 'Failed to read transcript', code: 500 }, 500)
  }
})

// DELETE /api/transcripts/:projectDir/:sessionId - Delete a transcript
transcripts.delete('/:projectDir/:sessionId', async (c) => {
  try {
    const projectDir = c.req.param('projectDir')
    const sessionId = c.req.param('sessionId')
    const projectsDir = getProjectsDir()
    const filePath = join(projectsDir, projectDir, `${sessionId}.jsonl`)
    
    try {
      await unlink(filePath)
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return c.json({ error: 'Transcript not found', code: 404 }, 404)
      }
      throw error
    }
    
    return c.json({ success: true, projectDir, sessionId })
  } catch (error) {
    console.error('Failed to delete transcript:', error)
    return c.json({ error: 'Failed to delete transcript', code: 500 }, 500)
  }
})

export default transcripts
