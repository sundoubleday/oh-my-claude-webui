import { readFile, writeFile, stat } from 'fs/promises'
import { homedir } from 'os'
import { join } from 'path'

export class ConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ConflictError'
  }
}

export class ConfigService {
  private claudeDir = join(homedir(), '.claude')
  private configPath = join(homedir(), '.claude.json')
  private settingsPath = join(this.claudeDir, 'settings.json')
  private lastMtime: Map<string, number> = new Map()
  
  /**
   * Reads a JSON file and records its modification time for concurrency detection.
   */
  async read(path: string): Promise<{ data: any, mtime: number }> {
    const content = await readFile(path, 'utf-8')
    const data = JSON.parse(content) // Validates JSON
    const { mtimeMs } = await stat(path)
    this.lastMtime.set(path, mtimeMs)
    return { data, mtime: mtimeMs }
  }
  
  /**
   * Writes data to a file with backup and concurrency check.
   * Throws ConflictError if the file was modified externally since last read.
   */
  async write(path: string, data: object): Promise<void> {
    // Concurrency check
    const currentStat = await stat(path).catch(() => null)
    if (currentStat) {
      const lastKnownMtime = this.lastMtime.get(path)
      if (lastKnownMtime !== undefined && currentStat.mtimeMs !== lastKnownMtime) {
        throw new ConflictError('File modified externally')
      }
    }

    // Create backup before writing
    try {
      const currentContent = await readFile(path)
      await writeFile(`${path}.bak`, currentContent)
    } catch (e) {
      // If file doesn't exist, backup might fail, which is fine for first write
    }

    // Write new data
    const newContent = JSON.stringify(data, null, 2)
    await writeFile(path, newContent, 'utf-8')
    
    // Update mtime after write
    const newStat = await stat(path)
    this.lastMtime.set(path, newStat.mtimeMs)
  }
  
  /**
   * Forces write without concurrency check, but still creates a backup.
   */
  async forceWrite(path: string, data: object): Promise<void> {
    // Create backup if file exists
    try {
      const currentContent = await readFile(path)
      await writeFile(`${path}.bak`, currentContent)
    } catch (e) {}

    const newContent = JSON.stringify(data, null, 2)
    await writeFile(path, newContent, 'utf-8')
    
    const newStat = await stat(path)
    this.lastMtime.set(path, newStat.mtimeMs)
  }
  
  getConfigPath(): string {
    return this.configPath
  }
  
  getSettingsPath(): string {
    return this.settingsPath
  }
}
