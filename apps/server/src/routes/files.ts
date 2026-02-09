import { Hono } from 'hono'
import { readdir, stat, readFile } from 'fs/promises'
import { join, isAbsolute, resolve } from 'path'
import { homedir } from 'os'

const files = new Hono()

// Helper: Decode path (handle URL encoding and project name conversion)
function decodePath(encodedPath: string): string {
  // URL decode first
  let decoded = decodeURIComponent(encodedPath)
  
  // Convert project directory name format back to real path
  // E--Vibe-Coding-claude-code -> E:\Vibe-Coding-claude-code
  // But preserve spaces if they exist
  decoded = decoded
    .replace(/^([A-Za-z])--/, '$1:\\')
    .replace(/--/g, '\\')
  
  return decoded
}

// GET /api/files - List directory contents
files.get('/', async (c) => {
  const pathParam = c.req.query('path')
  const dirPath = pathParam ? resolve(decodePath(pathParam)) : homedir()

  try {
    const entries = await readdir(dirPath, { withFileTypes: true })
    
    const items = await Promise.all(entries.map(async (entry) => {
      const fullPath = join(dirPath, entry.name)
      let isDirectory = entry.isDirectory()
      let size = 0
      let mtime = new Date()

      try {
        const s = await stat(fullPath)
        isDirectory = s.isDirectory()
        size = s.size
        mtime = s.mtime
      } catch {
        // Ignore stat errors (permissions etc)
      }

      return {
        name: entry.name,
        path: fullPath,
        isDirectory,
        size,
        mtime: mtime.toISOString(),
        extension: isDirectory ? null : entry.name.split('.').pop()
      }
    }))

    // Sort: Directories first, then files
    items.sort((a, b) => {
      if (a.isDirectory === b.isDirectory) {
        return a.name.localeCompare(b.name)
      }
      return a.isDirectory ? -1 : 1
    })

    return c.json({
      path: dirPath,
      items
    })
  } catch (error: any) {
    console.error('Failed to list files:', error)
    return c.json({ error: error.message || 'Failed to list directory', code: 500 }, 500)
  }
})

// GET /api/files/content - Read file content
files.get('/content', async (c) => {
  const pathParam = c.req.query('path')
  if (!pathParam) {
    return c.json({ error: 'Path required' }, 400)
  }

  try {
    const decodedPath = decodePath(pathParam)
    const content = await readFile(decodedPath, 'utf-8')
    return c.json({ content })
  } catch (error: any) {
    return c.json({ error: error.message || 'Failed to read file' }, 500)
  }
})

export default files
