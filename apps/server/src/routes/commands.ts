import { Hono } from 'hono'
import { readdir, readFile, writeFile, unlink, access } from 'fs/promises'
import { join } from 'path'
import { homedir } from 'os'

const commands = new Hono()

// Filename sanitization: only allow alphanumeric, hyphens, and underscores
const isSafeFilename = (name: string): boolean => {
  return /^[a-zA-Z0-9_-]+$/.test(name)
}

const getCommandsDir = (): string => {
  return join(homedir(), '.claude', 'commands')
}

const getCommandPath = (name: string): string => {
  return join(getCommandsDir(), `${name}.md`)
}

// GET /api/commands - Retrieve custom commands list
commands.get('/', async (c) => {
  try {
    const commandsDir = getCommandsDir()
    const files = await readdir(commandsDir)
    
    // Filter only .md files and return name + path
    const commandsList = files
      .filter(file => file.endsWith('.md'))
      .map(file => ({
        name: file.replace(/\.md$/, ''),
        path: join(commandsDir, file)
      }))
    
    return c.json(commandsList)
  } catch (error) {
    console.error('Failed to read commands directory:', error)
    return c.json({ error: 'Failed to read commands directory', code: 500 }, 500)
  }
})

// GET /api/commands/:name - Retrieve command content
commands.get('/:name', async (c) => {
  try {
    const name = c.req.param('name')
    
    // Validate filename
    if (!isSafeFilename(name)) {
      return c.json({ error: 'Invalid command name', code: 400 }, 400)
    }
    
    const commandPath = getCommandPath(name)
    
    // Check if file exists
    try {
      await access(commandPath)
    } catch {
      return c.json({ error: 'Command not found', code: 404 }, 404)
    }
    
    // Read file content
    const content = await readFile(commandPath, 'utf-8')
    
    return c.json({ name, content })
  } catch (error) {
    console.error('Failed to read command:', error)
    return c.json({ error: 'Failed to read command', code: 500 }, 500)
  }
})

// POST /api/commands - Create new command
commands.post('/', async (c) => {
  try {
    const body = await c.req.json()
    const { name, content } = body
    
    // Validate input
    if (!name || typeof name !== 'string') {
      return c.json({ error: 'Missing or invalid name', code: 400 }, 400)
    }
    
    if (!content || typeof content !== 'string') {
      return c.json({ error: 'Missing or invalid content', code: 400 }, 400)
    }
    
    // Validate filename
    if (!isSafeFilename(name)) {
      return c.json({ error: 'Invalid command name: only alphanumeric, hyphens, and underscores allowed', code: 400 }, 400)
    }
    
    const commandPath = getCommandPath(name)
    
    // Check if file already exists
    try {
      await access(commandPath)
      return c.json({ error: 'Command already exists', code: 409 }, 409)
    } catch {
      // File doesn't exist, which is what we want
    }
    
    // Write file
    await writeFile(commandPath, content, 'utf-8')
    
    return c.json({ success: true, name })
  } catch (error) {
    console.error('Failed to create command:', error)
    return c.json({ error: 'Failed to create command', code: 500 }, 500)
  }
})

// PUT /api/commands/:name - Update command content
commands.put('/:name', async (c) => {
  try {
    const name = c.req.param('name')
    const body = await c.req.json()
    const { content } = body
    
    // Validate filename
    if (!isSafeFilename(name)) {
      return c.json({ error: 'Invalid command name', code: 400 }, 400)
    }
    
    // Validate content
    if (!content || typeof content !== 'string') {
      return c.json({ error: 'Missing or invalid content', code: 400 }, 400)
    }
    
    const commandPath = getCommandPath(name)
    
    // Check if file exists
    try {
      await access(commandPath)
    } catch {
      return c.json({ error: 'Command not found', code: 404 }, 404)
    }
    
    // Update file
    await writeFile(commandPath, content, 'utf-8')
    
    return c.json({ success: true, name })
  } catch (error) {
    console.error('Failed to update command:', error)
    return c.json({ error: 'Failed to update command', code: 500 }, 500)
  }
})

// DELETE /api/commands/:name - Delete command
commands.delete('/:name', async (c) => {
  try {
    const name = c.req.param('name')
    
    // Validate filename
    if (!isSafeFilename(name)) {
      return c.json({ error: 'Invalid command name', code: 400 }, 400)
    }
    
    const commandPath = getCommandPath(name)
    
    // Check if file exists
    try {
      await access(commandPath)
    } catch {
      return c.json({ error: 'Command not found', code: 404 }, 404)
    }
    
    // Delete file
    await unlink(commandPath)
    
    return c.json({ success: true, name })
  } catch (error) {
    console.error('Failed to delete command:', error)
    return c.json({ error: 'Failed to delete command', code: 500 }, 500)
  }
})

export default commands
