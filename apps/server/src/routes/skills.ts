import { Hono } from 'hono'
import { readdir, readFile, cp, rm, stat } from 'fs/promises'
import { homedir } from 'os'
import { join, basename } from 'path'

const skills = new Hono()

interface Skill {
  name: string
  description: string
  path: string
}

/**
 * Parse YAML frontmatter from SKILL.md content
 * Extracts name and description fields
 */
function parseFrontmatter(content: string): { name?: string; description?: string } {
  const frontmatterMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!frontmatterMatch) {
    return {}
  }

  const frontmatter = frontmatterMatch[1]
  const nameMatch = frontmatter.match(/^name:\s*(.+)$/m)
  const descriptionMatch = frontmatter.match(/^description:\s*(.+)$/m)

  return {
    name: nameMatch?.[1]?.trim(),
    description: descriptionMatch?.[1]?.trim(),
  }
}

// GET /api/skills - Retrieve Skills list
skills.get('/', async (c) => {
  try {
    const skillsDir = join(homedir(), '.claude', 'skills')
    const entries = await readdir(skillsDir)

    const skillsList: Skill[] = []

    for (const entry of entries) {
      const skillPath = join(skillsDir, entry)
      const skillMdPath = join(skillPath, 'SKILL.md')

      // Check if SKILL.md exists
      try {
        await stat(skillMdPath)
      } catch {
        // Skip directories without SKILL.md
        continue
      }

      // Read and parse SKILL.md
      try {
        const content = await readFile(skillMdPath, 'utf-8')
        const { name, description } = parseFrontmatter(content)

        skillsList.push({
          name: name || entry,
          description: description || 'No description',
          path: skillPath,
        })
      } catch {
        // If parsing fails, include with default description
        skillsList.push({
          name: entry,
          description: 'No description',
          path: skillPath,
        })
      }
    }

    return c.json(skillsList)
  } catch (error) {
    console.error('Failed to list skills:', error)
    return c.json({ error: 'Failed to list skills', code: 500 }, 500)
  }
})

// POST /api/skills - Add Skill (copy folder)
skills.post('/', async (c) => {
  try {
    const body = await c.req.json()
    const { sourcePath } = body

    if (!sourcePath) {
      return c.json({ error: 'Missing sourcePath', code: 400 }, 400)
    }

    // Verify source path exists
    try {
      await stat(sourcePath)
    } catch {
      return c.json({ error: `Source path does not exist: ${sourcePath}`, code: 400 }, 400)
    }

    const skillName = basename(sourcePath)
    const targetPath = join(homedir(), '.claude', 'skills', skillName)

    // Copy the skill directory recursively
    await cp(sourcePath, targetPath, { recursive: true })

    return c.json({ success: true, name: skillName })
  } catch (error) {
    console.error('Failed to add skill:', error)
    return c.json({ error: 'Failed to add skill', code: 500 }, 500)
  }
})

// DELETE /api/skills/:name - Remove Skill
skills.delete('/:name', async (c) => {
  try {
    const name = c.req.param('name')
    const skillPath = join(homedir(), '.claude', 'skills', name)

    // Verify skill exists
    try {
      await stat(skillPath)
    } catch {
      return c.json({ error: 'Skill not found', code: 404 }, 404)
    }

    // Remove the skill directory recursively
    await rm(skillPath, { recursive: true, force: true })

    return c.json({ success: true, name })
  } catch (error) {
    console.error('Failed to delete skill:', error)
    return c.json({ error: 'Failed to delete skill', code: 500 }, 500)
  }
})

export default skills
