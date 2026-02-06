import { Hono } from 'hono'
import { readFile, writeFile, rm } from 'fs/promises'
import { homedir } from 'os'
import { join } from 'path'

const plugins = new Hono()

interface PluginVersion {
  scope: string
  installPath: string
  version: string
  installedAt: string
  lastUpdated: string
  gitCommitSha: string
}

interface InstalledPluginsData {
  version: number
  plugins: Record<string, PluginVersion[]>
}

interface PluginListItem {
  name: string
  version: string
  installPath: string
  installedAt: string
}

function getPluginsPath(): string {
  return join(homedir(), '.claude', 'plugins', 'installed_plugins.json')
}

async function readPluginsFile(): Promise<InstalledPluginsData> {
  const filePath = getPluginsPath()
  const content = await readFile(filePath, 'utf-8')
  return JSON.parse(content)
}

async function writePluginsFile(data: InstalledPluginsData): Promise<void> {
  const filePath = getPluginsPath()
  
  // Create backup
  const backupPath = `${filePath}.bak`
  try {
    const currentContent = await readFile(filePath, 'utf-8')
    await writeFile(backupPath, currentContent, 'utf-8')
  } catch (error) {
    console.warn('Failed to create backup:', error)
  }
  
  // Write new data
  await writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8')
}

// GET /api/plugins - 获取所有已安装的插件
plugins.get('/', async (c) => {
  try {
    const data = await readPluginsFile()
    
    // Transform plugins object into array format
    const pluginsList: PluginListItem[] = []
    
    for (const [name, versions] of Object.entries(data.plugins)) {
      // Get the latest version (first item in array)
      if (versions.length > 0) {
        const latest = versions[0]
        pluginsList.push({
          name,
          version: latest.version,
          installPath: latest.installPath,
          installedAt: latest.installedAt,
        })
      }
    }
    
    return c.json(pluginsList)
  } catch (error) {
    console.error('Failed to read plugins:', error)
    return c.json({ error: 'Failed to read plugins' }, 500)
  }
})

// DELETE /api/plugins/:name - 删除插件
plugins.delete('/:name', async (c) => {
  try {
    const name = c.req.param('name')
    
    const data = await readPluginsFile()
    
    // Check if plugin exists
    if (!data.plugins[name]) {
      return c.json({ error: 'Plugin not found' }, 404)
    }
    
    // Get install path before deleting
    const installPath = data.plugins[name][0]?.installPath
    
    // Remove plugin from data
    delete data.plugins[name]
    
    // Write updated data
    await writePluginsFile(data)
    
    // Try to delete cache directory
    if (installPath) {
      try {
        await rm(installPath, { recursive: true, force: true })
        console.log(`Deleted cache directory: ${installPath}`)
      } catch (error) {
        // Continue even if cache deletion fails
        console.warn(`Failed to delete cache directory ${installPath}:`, error)
      }
    }
    
    return c.json({ success: true, name })
  } catch (error) {
    console.error('Failed to delete plugin:', error)
    return c.json({ error: 'Failed to delete plugin' }, 500)
  }
})

export default plugins
