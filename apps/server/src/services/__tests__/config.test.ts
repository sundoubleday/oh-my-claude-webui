import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { ConfigService, ConflictError } from '../config'
import { writeFile, unlink, stat, mkdir } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'

describe('ConfigService', () => {
  let service: ConfigService
  let testFile: string
  let testDir: string
  
  beforeEach(async () => {
    service = new ConfigService()
    testDir = join(tmpdir(), `test-config-dir-${Date.now()}`)
    await mkdir(testDir, { recursive: true })
    testFile = join(testDir, `test-config.json`)
    await writeFile(testFile, JSON.stringify({ test: true }))
  })
  
  afterEach(async () => {
    try {
      await unlink(testFile)
    } catch {}
    try {
      await unlink(`${testFile}.bak`)
    } catch {}
    try {
      // Clean up directory if empty or just ignore
    } catch {}
  })
  
  it('should read JSON file', async () => {
    const result = await service.read(testFile)
    expect(result.data).toEqual({ test: true })
    expect(result.mtime).toBeGreaterThan(0)
  })
  
  it('should write with backup', async () => {
    await service.read(testFile) // 记录 mtime
    await service.write(testFile, { test: false })
    
    const content = await service.read(testFile)
    expect(content.data).toEqual({ test: false })
    
    const backupExists = await stat(`${testFile}.bak`).then(() => true).catch(() => false)
    expect(backupExists).toBe(true)
  })
  
  it('should detect concurrent modification', async () => {
    await service.read(testFile)
    
    // 模拟外部修改文件 (需要改变 mtime)
    // Wait a bit to ensure mtime changes
    await new Promise(resolve => setTimeout(resolve, 10))
    await writeFile(testFile, JSON.stringify({ modifiedByOther: true }))
    
    await expect(
      service.write(testFile, { test: false })
    ).rejects.toThrow(ConflictError)
  })
  
  it('should force write without mtime check', async () => {
    await service.read(testFile)
    
    await new Promise(resolve => setTimeout(resolve, 10))
    await writeFile(testFile, JSON.stringify({ modifiedByOther: true }))
    
    await expect(
      service.forceWrite(testFile, { forced: true })
    ).resolves.toBeUndefined()
    
    const result = await service.read(testFile)
    expect(result.data).toEqual({ forced: true })
  })
  
  it('should throw on invalid JSON', async () => {
    await writeFile(testFile, 'invalid json')
    
    await expect(
      service.read(testFile)
    ).rejects.toThrow()
  })

  it('should provide default paths', () => {
    const configPath = service.getConfigPath()
    const settingsPath = service.getSettingsPath()
    expect(configPath).toContain('.claude.json')
    expect(settingsPath).toContain('.claude')
    expect(settingsPath).toContain('settings.json')
  })
})
