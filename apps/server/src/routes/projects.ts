import { Hono } from 'hono'
import { readdir, stat, readFile } from 'fs/promises'
import { homedir } from 'os'
import { join } from 'path'

const projects = new Hono()

// Helper: Get projects directory path
function getProjectsDir(): string {
  return join(homedir(), '.claude', 'projects')
}

// Helper: Convert project directory name to readable path (Fallback)
function dirNameToPath(dirName: string): string {
  // E--Vibe-Coding -> E:\Vibe-Coding
  return dirName
    .replace(/^([A-Za-z])--/, '$1:\\')
    .replace(/--/g, '\\')
}

interface ProjectInfo {
  id: string;        // Encoded directory name
  name: string;      // Last part of the path
  path: string;      // Decoded full path
  lastActive: string; // Latest mtime of .jsonl files inside
}

// GET /api/projects - List all projects
projects.get('/', async (c) => {
  try {
    const projectsDir = getProjectsDir()
    let entries: string[] = []
    
    try {
      entries = await readdir(projectsDir)
    } catch {
      return c.json([])
    }
    
    const projectList: ProjectInfo[] = []
    
    for (const entry of entries) {
      const entryPath = join(projectsDir, entry)
      try {
        const s = await stat(entryPath)
        if (s.isDirectory()) {
          // Find the latest modified session in this project to determine "lastActive"
          const files = await readdir(entryPath)
          const jsonlFiles = files.filter(f => f.endsWith('.jsonl'))
          
          let lastActive = s.mtime.toISOString()
          let realPath = dirNameToPath(entry) // Fallback

          if (jsonlFiles.length > 0) {
            // Sort to find newest file
            const filesWithStats = await Promise.all(
              jsonlFiles.map(async f => ({
                name: f,
                stat: await stat(join(entryPath, f))
              }))
            )
            filesWithStats.sort((a, b) => b.stat.mtime.getTime() - a.stat.mtime.getTime())
            
            const latest = filesWithStats[0]
            lastActive = latest.stat.mtime.toISOString()

            // Try to extract real CWD from the session file
            try {
              const content = await readFile(join(entryPath, latest.name), 'utf-8')
              // Read first 10 lines to find cwd
              const lines = content.split('\n').slice(0, 10)
              for (const line of lines) {
                if (line.includes('"cwd":')) {
                  try {
                    const data = JSON.parse(line)
                    if (data.cwd) {
                      realPath = data.cwd
                      break
                    }
                  } catch {}
                }
              }
            } catch (e) {
              console.error('Failed to read session file for path:', e)
            }
          }

          const name = realPath.split(/[\\/]/).pop() || entry

          projectList.push({
            id: entry,
            name,
            path: realPath,
            lastActive
          })
        }
      } catch {
        // Skip inaccessible entries
      }
    }
    
    // Sort by last active
    projectList.sort((a, b) => new Date(b.lastActive).getTime() - new Date(a.lastActive).getTime())
    
    return c.json(projectList)
  } catch (error) {
    console.error('Failed to list projects:', error)
    return c.json({ error: 'Failed to list projects' }, 500)
  }
})

export default projects
